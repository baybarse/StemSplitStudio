/**
 * @fileoverview Audio decoding, encoding, and resampling utilities.
 *
 * Provides functions to:
 * - Decode arbitrary audio files to raw PCM (via Web Audio API)
 * - Resample to 44 100 Hz (the rate expected by HTDemucs)
 * - Encode PCM channels to a downloadable 16-bit WAV blob
 * - Create AudioBuffer instances for playback
 *
 * @module audio-engine
 */

/** @const {number} Target sample rate for the Demucs model. */
const TARGET_SAMPLE_RATE = 44100;

/**
 * @typedef {Object} DecodedAudio
 * @property {number}         sampleRate        - Sample rate of the decoded audio.
 * @property {number}         numberOfChannels  - Number of channels (always 2 after processing).
 * @property {Float32Array[]} channelData       - Array of per-channel sample buffers.
 * @property {number}         duration          - Duration in seconds.
 */

/**
 * Decode an audio file (MP3, WAV, FLAC, OGG, etc.) to raw PCM data.
 *
 * The decoded audio is always returned as **stereo at 44 100 Hz** to
 * satisfy the HTDemucs model requirements. Mono sources are duplicated
 * to both channels; non-44 100 Hz sources are resampled.
 *
 * @param {File|Blob} file - The audio file to decode.
 * @returns {Promise<DecodedAudio>} Decoded audio data.
 * @throws {Error} If decoding fails or the file is invalid.
 */
export async function decodeAudioFile(file) {
  // ── Read file into an ArrayBuffer ─────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();

  // ── Decode with Web Audio API ─────────────────────────────────────────
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  /** @type {AudioBuffer} */
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    audioCtx.close();
    throw new Error(
      `Failed to decode audio file "${file.name || 'unknown'}": ${err.message}`
    );
  }

  let { sampleRate, numberOfChannels } = audioBuffer;

  // ── Extract channel data ──────────────────────────────────────────────
  let channelData = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
  }

  // ── Mono → Stereo ────────────────────────────────────────────────────
  if (numberOfChannels === 1) {
    channelData = [channelData[0], new Float32Array(channelData[0])];
    numberOfChannels = 2;
  }

  // ── If more than 2 channels, keep only the first two ─────────────────
  if (numberOfChannels > 2) {
    channelData = channelData.slice(0, 2);
    numberOfChannels = 2;
  }

  // ── Resample to 44 100 Hz if necessary ────────────────────────────────
  if (sampleRate !== TARGET_SAMPLE_RATE) {
    channelData = await resampleAudio(channelData, sampleRate, TARGET_SAMPLE_RATE);
    sampleRate = TARGET_SAMPLE_RATE;
  }

  const duration = channelData[0].length / sampleRate;

  // Clean up the temporary context
  audioCtx.close();

  return { sampleRate, numberOfChannels, channelData, duration };
}

/**
 * Resample multi-channel audio to a target sample rate.
 *
 * Uses an {@link OfflineAudioContext} for high-quality resampling that
 * leverages the browser's native DSP implementation.
 *
 * @param {Float32Array[]} channelData - Array of per-channel sample buffers.
 * @param {number}         fromRate    - Original sample rate.
 * @param {number}         toRate      - Desired sample rate.
 * @returns {Promise<Float32Array[]>} Resampled channel data.
 */
export async function resampleAudio(channelData, fromRate, toRate) {
  if (fromRate === toRate) {
    return channelData;
  }

  const numChannels = channelData.length;
  const inputLength = channelData[0].length;
  const outputLength = Math.round(inputLength * (toRate / fromRate));

  // ── Build an OfflineAudioContext at the target rate ────────────────────
  const offlineCtx = new OfflineAudioContext(numChannels, outputLength, toRate);

  // Create a source buffer at the *original* rate
  const srcBuffer = offlineCtx.createBuffer(numChannels, inputLength, fromRate);
  for (let ch = 0; ch < numChannels; ch++) {
    srcBuffer.copyToChannel(channelData[ch], ch);
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = srcBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();

  const result = [];
  for (let ch = 0; ch < numChannels; ch++) {
    result.push(new Float32Array(rendered.getChannelData(ch)));
  }

  return result;
}

/**
 * Encode PCM channel data to a 16-bit WAV file.
 *
 * Produces a spec-compliant RIFF/WAVE blob suitable for download or
 * further processing. Float samples are clamped to [-1, 1] before
 * quantisation.
 *
 * @param {Float32Array[]} channelData - Array of per-channel sample buffers.
 * @param {number}         [sampleRate=44100] - Sample rate.
 * @returns {Blob} A WAV audio blob (`audio/wav`).
 */
export function encodeWav(channelData, sampleRate = TARGET_SAMPLE_RATE) {
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  // ── Total file size = 44-byte header + PCM data ───────────────────────
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // ── RIFF header ───────────────────────────────────────────────────────
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // ── fmt  sub-chunk ────────────────────────────────────────────────────
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true);            // AudioFormat   (1 = PCM)
  view.setUint16(22, numChannels, true);   // NumChannels
  view.setUint32(24, sampleRate, true);    // SampleRate
  view.setUint32(28, byteRate, true);      // ByteRate
  view.setUint16(32, blockAlign, true);    // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // ── data sub-chunk ────────────────────────────────────────────────────
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);      // Subchunk2Size

  // ── Interleave and quantise samples ───────────────────────────────────
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      // Clamp to [-1, 1] then convert to int16
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const int16 = sample < 0
        ? Math.max(-32768, Math.round(sample * 32768))
        : Math.min(32767, Math.round(sample * 32767));
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Write an ASCII string into a DataView at the given byte offset.
 *
 * @private
 * @param {DataView} view   - Target DataView.
 * @param {number}   offset - Byte offset to start writing.
 * @param {string}   str    - ASCII string to write.
 */
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Create a Web Audio {@link AudioBuffer} from Float32Array channels.
 *
 * Useful for playback via `AudioBufferSourceNode`.
 *
 * @param {Float32Array[]} channelData - Array of per-channel sample buffers.
 * @param {number}         sampleRate  - Sample rate of the audio.
 * @returns {AudioBuffer} A new AudioBuffer ready for playback.
 */
export function createAudioBuffer(channelData, sampleRate) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;

  const buffer = ctx.createBuffer(numChannels, numSamples, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    buffer.copyToChannel(channelData[ch], ch);
  }

  return buffer;
}
