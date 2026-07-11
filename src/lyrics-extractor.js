/**
 * @fileoverview Lyrics extraction using Whisper AI model.
 * Uses @huggingface/transformers to run Whisper in the browser.
 * Supports multilingual speech recognition.
 * @module lyrics-extractor
 */

import { pipeline, env } from '@huggingface/transformers';

// Use CDN for model files to avoid bundling
env.allowLocalModels = false;

/** @const {string} Whisper model to use (tiny = ~39MB, much faster for browsers) */
const MODEL_ID = 'onnx-community/whisper-tiny';

/** @const {number} Target sample rate for Whisper */
const WHISPER_SAMPLE_RATE = 16000;

/**
 * @typedef {Object} LyricsResult
 * @property {string} text - Full transcription text
 * @property {Array<{timestamp: number[], text: string}>} chunks - Timestamped chunks
 * @property {string} language - Detected language
 */

/** @type {any} Cached pipeline instance */
let transcriber = null;

/**
 * Detect best execution provider for transformers.js
 * @returns {Promise<'webgpu'|'wasm'>}
 */
async function detectDevice() {
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch (_) {}
  return 'wasm';
}

/**
 * Extract lyrics from audio data using Whisper AI.
 * 
 * @param {Float32Array} audioData - Mono audio data (any sample rate)
 * @param {number} sampleRate - Sample rate of the audio data
 * @param {Object} options
 * @param {(progress: {status: string, progress?: number}) => void} [options.onProgress]
 * @returns {Promise<LyricsResult>}
 */
export async function extractLyrics(audioData, sampleRate, options = {}) {
  const { onProgress = () => {} } = options;

  // Initialize pipeline if not cached
  if (!transcriber) {
    onProgress({ status: 'Detecting GPU capabilities...', progress: 0 });
    const device = await detectDevice();
    onProgress({ status: `Loading Whisper AI model (${device.toUpperCase()})...`, progress: 5 });
    
    transcriber = await pipeline(
      'automatic-speech-recognition',
      MODEL_ID,
      {
        dtype: 'q4', // quantized for speed/size
        device: device, // Use WebGPU if available, else WASM
        progress_callback: (info) => {
          if (info.status === 'progress' && info.progress) {
            onProgress({ 
              status: `Downloading model (~39MB)... ${info.progress.toFixed(0)}%`, 
              progress: 5 + (info.progress * 0.95) 
            });
          } else if (info.status === 'ready') {
            onProgress({ status: 'Model ready!', progress: 100 });
          }
        }
      }
    );
  }

  // Resample to 16kHz if needed (Whisper requires 16kHz)
  let processedAudio = audioData;
  if (sampleRate !== WHISPER_SAMPLE_RATE) {
    onProgress({ status: 'Resampling audio for speech recognition...' });
    processedAudio = resampleLinear(audioData, sampleRate, WHISPER_SAMPLE_RATE);
  }

  onProgress({ status: (options.task === 'translate' ? 'Translating to English...' : 'Transcribing lyrics...'), progress: 50 });

  // Run Whisper
  const result = await transcriber(processedAudio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language: null, // auto-detect
    task: options.task || 'transcribe',
  });

  onProgress({ status: (options.task === 'translate' ? 'Translation complete!' : 'Lyrics extracted!'), progress: 100 });


  return {
    text: result.text || '',
    chunks: result.chunks || [],
    language: result.language || 'unknown',
  };
}

/**
 * Simple linear resampling (fast, acceptable quality for speech).
 * @param {Float32Array} data
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Float32Array}
 */
function resampleLinear(data, fromRate, toRate) {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const newLength = Math.round(data.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(low + 1, data.length - 1);
    const frac = srcIdx - low;
    result[i] = data[low] * (1 - frac) + data[high] * frac;
  }
  return result;
}

/**
 * Dispose of the cached Whisper pipeline to free memory.
 */
export async function disposeLyrics() {
  if (transcriber) {
    try { await transcriber.dispose(); } catch (_) {}
    transcriber = null;
  }
}
