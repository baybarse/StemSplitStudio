/**
 * @fileoverview HTDemucs ONNX model loader and inference engine.
 *
 * Orchestrates the full music source separation pipeline:
 *
 * 1. **Provider detection** – Prefers WebGPU, falls back to WASM.
 * 2. **Model download & caching** – Fetches split ONNX pieces from
 *    Hugging Face CDN and caches them in IndexedDB via {@link ModelCache}.
 * 3. **Inference** – Runs the STFT → model → iSTFT pipeline to produce
 *    four stems: drums, bass, other, vocals.
 *
 * @module demucs-processor
 */

import * as ort from 'onnxruntime-web';
import { ModelCache } from './model-cache.js';
import { stft, istft } from './stft.js';

// ─── ONNX Runtime global configuration ──────────────────────────────────────
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
ort.env.wasm.simd = true;

// ─── Constants ───────────────────────────────────────────────────────────────

/** @const {string} Base URL for model files on Hugging Face. */
const MODEL_BASE_URL =
  'https://huggingface.co/monteslu/htdemucs-ft-webgpu/resolve/main/';

/** @const {string} URL for the split-model manifest. */
const MANIFEST_URL = MODEL_BASE_URL + 'htdemucs_split_manifest.json';

/** @const {number} Sample rate expected by HTDemucs. */
const SAMPLE_RATE = 44100;

/** @const {number} FFT window size. */
const N_FFT = 4096;

/** @const {number} STFT hop size. */
const HOP_LENGTH = 1024;

/** @const {string[]} Stem names in model output order. */
const STEMS = ['drums', 'bass', 'other', 'vocals'];

/**
 * @typedef {Object} SeparationResult
 * @property {Float32Array[]} drums  - Stereo drum stem [L, R].
 * @property {Float32Array[]} bass   - Stereo bass stem [L, R].
 * @property {Float32Array[]} other  - Stereo "other" stem [L, R].
 * @property {Float32Array[]} vocals - Stereo vocal stem [L, R].
 */

/**
 * @callback ProgressCallback
 * @param {number} current - Current progress value.
 * @param {number|string} totalOrStatus - Total value *or* status string.
 * @param {string} [status] - Optional human-readable status message.
 */

/**
 * Manages HTDemucs ONNX model loading and stem separation inference.
 *
 * @example
 * ```js
 * const proc = new DemucsProcessor();
 * await proc.loadModel((cur, total, msg) => console.log(msg));
 * const stems = await proc.separate(audioData, (pct, msg) => console.log(`${pct}% – ${msg}`));
 * ```
 */
export class DemucsProcessor {
  constructor() {
    /** @type {ort.InferenceSession[]} Loaded ONNX sessions (one per model piece). */
    this.sessions = [];

    /** @type {Object|null} Parsed manifest JSON. */
    this.manifest = null;

    /** @type {ModelCache} IndexedDB cache instance. */
    this.cache = new ModelCache();

    /** @type {boolean} Whether the model is ready for inference. */
    this.isLoaded = false;

    /** @type {'webgpu'|'wasm'} Active ONNX execution provider. */
    this.executionProvider = 'webgpu';
  }

  // ─── Provider detection ──────────────────────────────────────────────────

  /**
   * Detect the best available ONNX execution provider.
   *
   * Tries WebGPU first (requires `navigator.gpu` + a valid adapter),
   * then falls back to multi-threaded WASM.
   *
   * @returns {Promise<'webgpu'|'wasm'>} The selected provider name.
   */
  async detectBestProvider() {
    try {
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          this.executionProvider = 'webgpu';
          return 'webgpu';
        }
      }
    } catch (_) {
      /* WebGPU not available – fall through */
    }
    this.executionProvider = 'wasm';
    return 'wasm';
  }

  // ─── Model loading ──────────────────────────────────────────────────────

  /**
   * Download (or restore from cache) and initialise the HTDemucs model.
   *
   * The model is split into multiple ONNX pieces. Each piece is cached
   * individually in IndexedDB so that partial downloads can resume.
   *
   * @param {ProgressCallback} [onProgress] - Progress callback.
   * @throws {Error} If any piece fails to download or create a session.
   */
  async loadModel(onProgress = () => {}) {
    await this.cache.open();
    const provider = await this.detectBestProvider();
    onProgress(0, 100, `Using ${provider.toUpperCase()} backend`);

    // ── 1. Fetch or restore manifest ──────────────────────────────────
    let manifest;
    try {
      const cachedManifest = await this.cache.get('manifest');
      if (cachedManifest) {
        manifest = JSON.parse(new TextDecoder().decode(cachedManifest));
      } else {
        const resp = await fetch(MANIFEST_URL);
        if (!resp.ok) {
          throw new Error(`Manifest fetch failed: HTTP ${resp.status}`);
        }
        manifest = await resp.json();
        await this.cache.set(
          'manifest',
          new TextEncoder().encode(JSON.stringify(manifest))
        );
      }
    } catch (err) {
      throw new Error(`Failed to load model manifest: ${err.message}`);
    }
    this.manifest = manifest;

    // ── 2. Resolve model filenames from manifest ──────────────────────
    const modelFiles = this._resolveModelFiles(manifest);
    const totalPieces = modelFiles.length;

    if (totalPieces === 0) {
      throw new Error('Manifest contains no model files');
    }

    // ── 3. Download & create sessions ─────────────────────────────────
    const sessions = [];

    for (let i = 0; i < totalPieces; i++) {
      const filename = modelFiles[i];
      onProgress(
        i,
        totalPieces,
        `Loading model piece ${i + 1}/${totalPieces}…`
      );

      // Fetch or use cache
      let modelData = await this.cache.get(filename);
      if (!modelData) {
        const url = MODEL_BASE_URL + filename;
        onProgress(
          i,
          totalPieces,
          `Downloading ${filename}…`
        );
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to download model piece "${filename}": HTTP ${response.status}`
          );
        }
        modelData = await response.arrayBuffer();
        await this.cache.set(filename, modelData);
      }

      // Create ONNX InferenceSession
      const session = await this._createSession(modelData);
      sessions.push(session);
    }

    this.sessions = sessions;
    this.isLoaded = true;
    onProgress(totalPieces, totalPieces, 'Model loaded successfully!');
  }

  /**
   * Parse the manifest JSON and return a flat list of ONNX filenames.
   *
   * Handles several known manifest shapes:
   * - `{ pieces: [{ filename }, ...] }`
   * - `{ files: [...] }`
   * - Top-level keys ending with `.onnx`
   * - Plain array of strings
   *
   * @private
   * @param {Object} manifest
   * @returns {string[]}
   */
  _resolveModelFiles(manifest) {
    // Array of piece objects with a `filename` or `name` field
    if (Array.isArray(manifest.pieces)) {
      return manifest.pieces.map(
        (p) => (typeof p === 'string' ? p : p.filename || p.name)
      );
    }

    // Array of filenames
    if (Array.isArray(manifest.files)) {
      return manifest.files;
    }

    // Top-level keys that look like ONNX filenames
    const onnxKeys = Object.keys(manifest).filter((k) => k.endsWith('.onnx'));
    if (onnxKeys.length > 0) return onnxKeys;

    // Fallback: numbered pieces (htdemucs_p00.onnx … htdemucs_pNN.onnx)
    const count = manifest.num_pieces || manifest.numPieces || 1;
    return Array.from({ length: count }, (_, i) =>
      `htdemucs_p${String(i).padStart(2, '0')}.onnx`
    );
  }

  /**
   * Create an ONNX InferenceSession, falling back from WebGPU to WASM
   * if the preferred provider fails.
   *
   * @private
   * @param {ArrayBuffer} modelData - Raw ONNX model bytes.
   * @returns {Promise<ort.InferenceSession>}
   */
  async _createSession(modelData) {
    /** @type {ort.InferenceSession.SessionOptions} */
    const opts = {
      executionProviders: [this.executionProvider],
      graphOptimizationLevel: 'all',
    };

    try {
      return await ort.InferenceSession.create(modelData, opts);
    } catch (primaryErr) {
      if (this.executionProvider === 'webgpu') {
        console.warn(
          '[DemucsProcessor] WebGPU session creation failed, falling back to WASM:',
          primaryErr
        );
        this.executionProvider = 'wasm';
        opts.executionProviders = ['wasm'];
        return await ort.InferenceSession.create(modelData, opts);
      }
      throw primaryErr;
    }
  }

  // ─── Inference ──────────────────────────────────────────────────────────

  /**
   * Separate a stereo audio signal into four stems.
   *
   * Pipeline:
   * 1. Compute STFT of each input channel.
   * 2. Build input tensors and feed through all model pieces sequentially.
   * 3. Extract per-stem spectrograms from the model output.
   * 4. Reconstruct time-domain stems via iSTFT.
   *
   * @param {{ channelData: Float32Array[], sampleRate: number }} audioData
   * @param {(percent: number, status: string) => void} [onProgress]
   * @returns {Promise<SeparationResult>}
   * @throws {Error} If the model has not been loaded.
   */
  async separate(audioData, onProgress = () => {}) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded – call loadModel() first');
    }

    const { channelData } = audioData;
    const numSamples = channelData[0].length;

    // ── 1. Forward STFT ───────────────────────────────────────────────
    onProgress(5, 'Computing STFT…');

    const stftResults = channelData.map((ch) => stft(ch, N_FFT, HOP_LENGTH));
    const { nBins, nFrames } = stftResults[0];

    // ── 2. Build input tensors ────────────────────────────────────────
    onProgress(10, 'Preparing model input…');

    const inputReal = new Float32Array(2 * nBins * nFrames);
    const inputImag = new Float32Array(2 * nBins * nFrames);

    for (let ch = 0; ch < 2; ch++) {
      for (let f = 0; f < nBins; f++) {
        for (let t = 0; t < nFrames; t++) {
          const dstIdx = ch * nBins * nFrames + f * nFrames + t;
          const srcIdx = t * nBins + f;
          inputReal[dstIdx] = stftResults[ch].real[srcIdx];
          inputImag[dstIdx] = stftResults[ch].imag[srcIdx];
        }
      }
    }

    const shape = [1, 2, nBins, nFrames];

    // ── 3. Run model pieces ───────────────────────────────────────────
    onProgress(15, 'Running AI model…');

    /** @type {Record<string, ort.Tensor>} */
    let currentTensors = this._buildInitialFeeds(inputReal, inputImag, shape);

    for (let i = 0; i < this.sessions.length; i++) {
      const session = this.sessions[i];
      const pct = 15 + Math.round((70 * (i + 1)) / this.sessions.length);
      onProgress(pct, `Processing piece ${i + 1}/${this.sessions.length}…`);

      // Only pass tensors that this session expects
      const feeds = {};
      for (const name of session.inputNames) {
        if (currentTensors[name]) {
          feeds[name] = currentTensors[name];
        }
      }

      const results = await session.run(feeds);

      // Merge outputs into the tensor map for the next piece
      for (const [name, tensor] of Object.entries(results)) {
        currentTensors[name] = tensor;
      }

      // Yield to the event loop so the UI stays responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    // ── 4. Reconstruct stems from output tensors ──────────────────────
    onProgress(88, 'Computing inverse STFT…');

    const stems = this._extractStems(
      currentTensors,
      nBins,
      nFrames,
      numSamples,
      channelData
    );

    onProgress(100, 'Separation complete!');
    return stems;
  }

  /**
   * Build the initial feed dictionary for the first model piece.
   *
   * @private
   * @param {Float32Array} inputReal
   * @param {Float32Array} inputImag
   * @param {number[]}     shape - [1, 2, nBins, nFrames]
   * @returns {Record<string, ort.Tensor>}
   */
  _buildInitialFeeds(inputReal, inputImag, shape) {
    const session0 = this.sessions[0];
    const inputNames = session0.inputNames;

    /** @type {Record<string, ort.Tensor>} */
    const feeds = {};

    if (inputNames.length >= 2) {
      // Two separate inputs: real and imaginary spectrograms
      feeds[inputNames[0]] = new ort.Tensor('float32', inputReal, shape);
      feeds[inputNames[1]] = new ort.Tensor('float32', inputImag, shape);
    } else {
      // Single input – interleave real & imaginary along a trailing dim
      const nBins = shape[2];
      const nFrames = shape[3];
      const combined = new Float32Array(inputReal.length * 2);
      for (let i = 0; i < inputReal.length; i++) {
        combined[i * 2] = inputReal[i];
        combined[i * 2 + 1] = inputImag[i];
      }
      feeds[inputNames[0]] = new ort.Tensor(
        'float32',
        combined,
        [1, 2, nBins, nFrames, 2]
      );
    }

    return feeds;
  }

  /**
   * Extract the four separated stems from the model's output tensors
   * and reconstruct their time-domain signals via iSTFT.
   *
   * Handles two output layouts:
   * 1. **Single tensor** – shape `[1, 4, 2, nBins, nFrames]` (all stems packed).
   * 2. **Per-stem tensors** – separate `*_real` / `*_imag` tensors per stem.
   *
   * @private
   * @param {Record<string, ort.Tensor>} tensors
   * @param {number} nBins
   * @param {number} nFrames
   * @param {number} originalLength - Original number of samples.
   * @param {Float32Array[]} channelData - Original input (used as fallback).
   * @returns {SeparationResult}
   */
  _extractStems(tensors, nBins, nFrames, originalLength, channelData) {
    const lastSession = this.sessions[this.sessions.length - 1];
    const outputNames = lastSession.outputNames;
    const halfFft = N_FFT >>> 1;
    const paddedLength = originalLength + N_FFT;

    /** @type {Record<string, Float32Array[]>} */
    const stems = {};

    if (outputNames.length === 1) {
      // ── Single packed output tensor ─────────────────────────────────
      const output = tensors[outputNames[0]];
      const data = output.data;
      const stemSize = data.length / 4;
      const channelSize = stemSize / 2;

      for (let s = 0; s < 4; s++) {
        const stemChannels = [];
        for (let ch = 0; ch < 2; ch++) {
          const realPart = new Float32Array(nBins * nFrames);
          const imagPart = new Float32Array(nBins * nFrames);

          for (let f = 0; f < nBins; f++) {
            for (let t = 0; t < nFrames; t++) {
              const outIdx =
                s * stemSize + ch * channelSize + f * nFrames + t;
              // Store in frame-major order (t * nBins + f) for istft
              realPart[t * nBins + f] = data[outIdx];
            }
          }

          const reconstructed = istft(
            realPart,
            imagPart,
            nBins,
            nFrames,
            N_FFT,
            HOP_LENGTH,
            paddedLength
          );
          // Remove STFT center padding
          stemChannels.push(
            reconstructed.slice(halfFft, halfFft + originalLength)
          );
        }
        stems[STEMS[s]] = stemChannels;
      }
    } else {
      // ── Per-stem real/imag output tensors ────────────────────────────
      for (let s = 0; s < STEMS.length; s++) {
        const stemName = STEMS[s];
        const realKey = outputNames.find(
          (n) => n.includes(stemName) && /re(al)?/i.test(n)
        );
        const imagKey = outputNames.find(
          (n) => n.includes(stemName) && /im(ag)?/i.test(n)
        );

        if (realKey && imagKey) {
          const realTensor = tensors[realKey];
          const imagTensor = tensors[imagKey];
          const stemChannels = [];

          for (let ch = 0; ch < 2; ch++) {
            const chOffset = ch * nBins * nFrames;
            const realPart = new Float32Array(nBins * nFrames);
            const imagPart = new Float32Array(nBins * nFrames);

            for (let j = 0; j < nBins * nFrames; j++) {
              realPart[j] = realTensor.data[chOffset + j];
              imagPart[j] = imagTensor.data[chOffset + j];
            }

            const reconstructed = istft(
              realPart,
              imagPart,
              nBins,
              nFrames,
              N_FFT,
              HOP_LENGTH,
              paddedLength
            );
            stemChannels.push(
              reconstructed.slice(halfFft, halfFft + originalLength)
            );
          }
          stems[stemName] = stemChannels;
        }
      }
    }

    // ── Fallback: fill missing stems with silence ─────────────────────
    for (const name of STEMS) {
      if (!stems[name]) {
        console.warn(
          `[DemucsProcessor] Could not extract "${name}" stem – filling with silence`
        );
        stems[name] = channelData.map(
          (ch) => new Float32Array(ch.length)
        );
      }
    }

    return /** @type {SeparationResult} */ (stems);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Release all ONNX sessions and free GPU/WASM resources.
   */
  async dispose() {
    for (const session of this.sessions) {
      try {
        await session.release();
      } catch (err) {
        console.warn('[DemucsProcessor] Error releasing session:', err);
      }
    }
    this.sessions = [];
    this.isLoaded = false;
  }

  /**
   * Delete all cached model data from IndexedDB.
   *
   * @returns {Promise<void>}
   */
  async clearCache() {
    await this.cache.open();
    await this.cache.clear();
  }

  /**
   * Get the total size of cached model data.
   *
   * @returns {Promise<number>} Size in bytes.
   */
  async getCacheSize() {
    await this.cache.open();
    return this.cache.getSize();
  }
}
