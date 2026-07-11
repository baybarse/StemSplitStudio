/**
 * @fileoverview HTDemucs model loader and inference engine.
 *
 * Uses the `demucs-web` package which handles the full pipeline:
 * STFT → ONNX inference → masking → iSTFT
 *
 * Model source: Hugging Face (timcsy/demucs-web-onnx)
 *
 * @module demucs-processor
 */

import * as ort from 'onnxruntime-web';
import { DemucsProcessor as DemucsWebProcessor, CONSTANTS } from 'demucs-web';
import { ModelCache } from './model-cache.js';

// ─── ONNX Runtime configuration ─────────────────────────────────────────────
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
ort.env.wasm.simd = true;

// ─── Constants ───────────────────────────────────────────────────────────────

/** @const {string} Default model URL on Hugging Face. */
const DEFAULT_MODEL_URL = CONSTANTS.DEFAULT_MODEL_URL ||
  'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx';

/** @const {string[]} Stem names in model output order. */
const STEMS = CONSTANTS.TRACKS || ['drums', 'bass', 'other', 'vocals'];

/**
 * @typedef {Object} SeparationResult
 * @property {Float32Array[]} drums  - Stereo drum stem [L, R].
 * @property {Float32Array[]} bass   - Stereo bass stem [L, R].
 * @property {Float32Array[]} other  - Stereo "other" stem [L, R].
 * @property {Float32Array[]} vocals - Stereo vocal stem [L, R].
 */

/**
 * Wrapper around demucs-web that adds IndexedDB caching and
 * progress reporting for the StemSplit UI.
 */
export class DemucsProcessor {
  constructor() {
    /** @type {DemucsWebProcessor|null} */
    this.processor = null;

    /** @type {ModelCache} */
    this.cache = new ModelCache();

    /** @type {boolean} */
    this.isLoaded = false;

    /** @type {'webgpu'|'wasm'} */
    this.executionProvider = 'wasm';
  }

  // ─── Provider detection ────────────────────────────────────────────────

  /**
   * Detect the best available execution provider.
   * @returns {Promise<'webgpu'|'wasm'>}
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
    } catch (_) { /* WebGPU not available */ }
    this.executionProvider = 'wasm';
    return 'wasm';
  }

  // ─── Model loading ────────────────────────────────────────────────────

  /**
   * Load the HTDemucs model. Downloads from HF CDN on first use,
   * caches in IndexedDB for subsequent visits.
   *
   * @param {(current: number, total: number, status: string) => void} [onProgress]
   */
  async loadModel(onProgress = () => {}) {
    await this.cache.open();
    const provider = await this.detectBestProvider();
    onProgress(0, 100, `Using ${provider.toUpperCase()} backend`);

    // Build session options based on detected provider
    const sessionOptions = {
      executionProviders: [provider, 'wasm'], // fallback chain
      graphOptimizationLevel: 'basic',
    };

    // Create the demucs-web processor
    this.processor = new DemucsWebProcessor({
      ort,
      sessionOptions,
      onProgress: ({ progress, currentSegment, totalSegments }) => {
        const pct = Math.round(progress * 100);
        onProgress(
          pct,
          100,
          `Processing segment ${currentSegment}/${totalSegments}…`
        );
      },
      onLog: (phase, msg) => {
        console.log(`[Demucs][${phase}] ${msg}`);
      },
      onDownloadProgress: (loaded, total) => {
        const pct = Math.round((loaded / total) * 100);
        onProgress(pct, 100, `Downloading model… ${(loaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`);
      },
    });

    // Check cache first
    onProgress(5, 100, 'Checking model cache…');
    const cachedModel = await this.cache.get('htdemucs_embedded');

    if (cachedModel) {
      onProgress(50, 100, 'Loading model from cache…');
      try {
        await this.processor.loadModel(cachedModel);
        this.isLoaded = true;
        onProgress(100, 100, 'Model loaded from cache!');
        return;
      } catch (err) {
        console.warn('[DemucsProcessor] Cached model failed to load, re-downloading:', err);
        await this.cache.delete('htdemucs_embedded');
      }
    }

    // Download from HF CDN
    onProgress(10, 100, 'Downloading AI model (~172MB)…');
    try {
      const response = await fetch(DEFAULT_MODEL_URL);
      if (!response.ok) {
        throw new Error(`Model download failed: HTTP ${response.status}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (contentLength > 0) {
          const pct = Math.round((receivedLength / contentLength) * 80) + 10;
          const mb = (receivedLength / 1024 / 1024).toFixed(1);
          const totalMb = (contentLength / 1024 / 1024).toFixed(1);
          onProgress(pct, 100, `Downloading model… ${mb}MB / ${totalMb}MB`);
        }
      }

      // Merge chunks into single ArrayBuffer
      const modelData = new Uint8Array(receivedLength);
      let offset = 0;
      for (const chunk of chunks) {
        modelData.set(chunk, offset);
        offset += chunk.length;
      }

      // Cache the model
      onProgress(92, 100, 'Caching model for future use…');
      await this.cache.set('htdemucs_embedded', modelData.buffer);

      // Load into ONNX session
      onProgress(95, 100, 'Initializing AI model…');
      await this.processor.loadModel(modelData.buffer);

      this.isLoaded = true;
      onProgress(100, 100, 'Model loaded successfully!');

    } catch (err) {
      throw new Error(`Failed to load model: ${err.message}`);
    }
  }

  // ─── Inference ────────────────────────────────────────────────────────

  /**
   * Separate a stereo audio signal into four stems.
   *
   * @param {{ channelData: Float32Array[], sampleRate: number }} audioData
   * @param {(percent: number, status: string) => void} [onProgress]
   * @returns {Promise<SeparationResult>}
   */
  async separate(audioData, onProgress = () => {}) {
    if (!this.isLoaded || !this.processor) {
      throw new Error('Model not loaded – call loadModel() first');
    }

    const { channelData } = audioData;

    onProgress(5, 'Preparing audio data…');

    const leftChannel = channelData[0];
    const rightChannel = channelData.length > 1 ? channelData[1] : channelData[0];

    onProgress(10, 'Running AI stem separation…');

    // Update progress callback for separation
    let lastReportedPct = 10;
    this.processor.onProgress = ({ progress }) => {
      const pct = 10 + Math.round(progress * 85);
      if (pct > lastReportedPct) {
        lastReportedPct = pct;
        onProgress(pct, `Separating stems… ${pct}%`);
      }
    };

    // Run separation via demucs-web
    const result = await this.processor.separate(leftChannel, rightChannel);

    onProgress(98, 'Finalizing stems…');

    // Convert demucs-web output format to our format
    // demucs-web returns: { drums: { left, right }, bass: { left, right }, ... }
    /** @type {SeparationResult} */
    const stems = {};
    for (const stem of STEMS) {
      if (result[stem]) {
        stems[stem] = [
          result[stem].left || new Float32Array(leftChannel.length),
          result[stem].right || new Float32Array(rightChannel.length),
        ];
      } else {
        // Fallback: silence
        stems[stem] = [
          new Float32Array(leftChannel.length),
          new Float32Array(rightChannel.length),
        ];
      }
    }

    onProgress(100, 'Separation complete!');
    return stems;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /** Release resources. */
  async dispose() {
    this.processor = null;
    this.isLoaded = false;
  }

  /** Clear cached model from IndexedDB. */
  async clearCache() {
    await this.cache.open();
    await this.cache.clear();
  }

  /** Get total cache size in bytes. */
  async getCacheSize() {
    await this.cache.open();
    return this.cache.getSize();
  }
}
