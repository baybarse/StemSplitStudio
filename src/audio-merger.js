/**
 * @fileoverview Audio Merger Module.
 * Merges multiple audio files into a single audio mix.
 * @module audio-merger
 */

import { decodeAudioFile, encodeWav } from './audio-engine.js';

/**
 * Mixes multiple audio buffers into a single blob.
 * @param {Array<{buffer: AudioBuffer, volume: number}>} tracks 
 * @param {number} sampleRate 
 * @returns {Blob} The mixed WAV blob
 */
export async function mixMultipleTracks(tracks, sampleRate = 44100) {
  if (!tracks || tracks.length === 0) {
    throw new Error("No tracks provided for mixing.");
  }

  // Find the longest track duration
  let maxLength = 0;
  for (const track of tracks) {
    if (track.buffer.length > maxLength) {
      maxLength = track.buffer.length;
    }
  }

  const mixedL = new Float32Array(maxLength);
  const mixedR = new Float32Array(maxLength);

  for (const track of tracks) {
    const vol = track.volume !== undefined ? track.volume : 1.0;
    const l = track.buffer.getChannelData(0);
    const r = track.buffer.numberOfChannels > 1 ? track.buffer.getChannelData(1) : l;

    for (let i = 0; i < l.length; i++) {
      mixedL[i] += l[i] * vol;
      mixedR[i] += r[i] * vol;
    }
  }

  // Hard clipper
  for (let i = 0; i < maxLength; i++) {
    if (mixedL[i] > 1.0) mixedL[i] = 1.0;
    if (mixedL[i] < -1.0) mixedL[i] = -1.0;
    if (mixedR[i] > 1.0) mixedR[i] = 1.0;
    if (mixedR[i] < -1.0) mixedR[i] = -1.0;
  }

  return encodeWav([mixedL, mixedR], sampleRate);
}
