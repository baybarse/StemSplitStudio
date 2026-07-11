/**
 * @fileoverview Main application entry point for StemSplit.
 *
 * Orchestrates the UI state machine, file handling, model loading,
 * audio separation, playback, and download functionality.
 *
 * @module main
 */

import { DemucsProcessor } from './demucs-processor.js';
import { decodeAudioFile, encodeWav, createAudioBuffer } from './audio-engine.js';
import { WaveformRenderer } from './waveform.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const STEMS = ['vocals', 'drums', 'bass', 'other'];
const STEM_COLORS = {
  vocals: '#a855f7',
  drums:  '#ef4444',
  bass:   '#3b82f6',
  other:  '#22c55e',
};
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_TYPES = [
  'audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg',
  'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm',
];
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.webm'];

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {DemucsProcessor} */
const processor = new DemucsProcessor();

/** @type {File|null} Currently selected audio file. */
let currentFile = null;

/** @type {import('./audio-engine.js').DecodedAudio|null} */
let decodedAudio = null;

/** @type {Record<string, Float32Array[]>} Separated stems. */
let stems = {};

/** @type {Record<string, WaveformRenderer>} Waveform renderers per stem. */
const waveformRenderers = {};

/** @type {AudioContext|null} Shared AudioContext for playback. */
let audioCtx = null;

/** @type {Record<string, { source: AudioBufferSourceNode, gain: GainNode, startTime: number, startOffset: number, buffer: AudioBuffer }>} Active audio sources per stem. */
const audioSources = {};

/** @type {Record<string, boolean>} Per-stem playing state. */
const playingState = {};

/** @type {Record<string, boolean>} Per-stem mute state. */
const muteState = {};

/** @type {Record<string, boolean>} Per-stem solo state. */
const soloState = {};

/** @type {Record<string, number>} Per-stem volume (0–1). */
const volumeState = {};

/** @type {boolean} Whether all stems are playing in sync. */
let isSyncPlaying = false;

// ─── DOM References ─────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const uploadArea        = $('upload-area');
const fileInput         = $('file-input');
const fileInfo          = $('file-info');
const fileName          = $('file-name');
const fileSize          = $('file-size');
const removeFileBtn     = $('remove-file-btn');
const modelOverlay      = $('model-loading-overlay');
const modelStatus       = $('model-loading-status');
const modelProgressBar  = $('model-progress-bar');
const modelProgressText = $('model-progress-text');
const processingSection = $('processing-section');
const processingTitle   = $('processing-title');
const processingStatus  = $('processing-status');
const sepProgressBar    = $('separation-progress-bar');
const sepProgressText   = $('separation-progress-text');
const resultsSection    = $('results-section');
const uploadSection     = $('upload-section');
const heroSection       = $('hero-section');
const downloadAllBtn    = $('download-all-btn');
const newSeparationBtn  = $('new-separation-btn');

// ─── Initialisation ─────────────────────────────────────────────────────────

function init() {
  // Init stem states
  STEMS.forEach((stem) => {
    playingState[stem] = false;
    muteState[stem]    = false;
    soloState[stem]    = false;
    volumeState[stem]  = 1.0;
  });

  setupUploadHandlers();
  setupResultsHandlers();
  setupKeyboardShortcuts();

  console.log('[StemSplit] App initialised');
}

// ─── Upload Handling ────────────────────────────────────────────────────────

function setupUploadHandlers() {
  // Click to upload
  uploadArea.addEventListener('click', () => fileInput.click());

  // Keyboard a11y
  uploadArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag & Drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');

    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Remove file button
  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
  });
}

/**
 * Validate and process a user-selected audio file.
 * @param {File} file
 */
async function handleFile(file) {
  // Validate file type
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const isValidType = ACCEPTED_TYPES.includes(file.type) ||
                      ACCEPTED_EXTENSIONS.includes(ext);

  if (!isValidType) {
    showError('Unsupported file format. Please use MP3, WAV, FLAC, OGG, or M4A.');
    return;
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    showError(`File is too large (${formatBytes(file.size)}). Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`);
    return;
  }

  currentFile = file;

  // Update file info display
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.classList.remove('hidden');
  uploadArea.classList.add('hidden');

  // Start processing
  await startProcessing();
}

function resetUpload() {
  currentFile = null;
  decodedAudio = null;
  stems = {};
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  uploadArea.classList.remove('hidden');
}

// ─── Processing Pipeline ────────────────────────────────────────────────────

async function startProcessing() {
  try {
    // Show processing UI
    uploadSection.classList.add('hidden');
    heroSection.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    // Step 1: Decode audio
    updateProcessingUI(0, 'Decoding audio file…');
    decodedAudio = await decodeAudioFile(currentFile);
    updateProcessingUI(5, `Audio decoded: ${decodedAudio.duration.toFixed(1)}s, ${decodedAudio.sampleRate}Hz`);

    // Step 2: Load model (if not already loaded)
    if (!processor.isLoaded) {
      modelOverlay.classList.remove('hidden');
      await processor.loadModel((current, total, status) => {
        const pct = Math.round((current / total) * 100);
        modelProgressBar.style.width = `${pct}%`;
        modelProgressText.textContent = `${pct}%`;
        modelStatus.textContent = status;
      });
      modelOverlay.classList.add('hidden');
    }

    // Step 3: Separate stems
    updateProcessingUI(10, 'Starting stem separation…');
    stems = await processor.separate(decodedAudio, (percent, status) => {
      updateProcessingUI(percent, status);
    });

    // Step 4: Show results
    showResults();

  } catch (err) {
    console.error('[StemSplit] Processing error:', err);
    showError(`Processing failed: ${err.message}`);
    resetToUpload();
  }
}

function updateProcessingUI(percent, status) {
  sepProgressBar.style.width = `${percent}%`;
  sepProgressText.textContent = `${percent}%`;
  processingStatus.textContent = status;

  if (percent < 10) {
    processingTitle.textContent = 'Preparing Audio…';
  } else if (percent < 85) {
    processingTitle.textContent = 'Separating Stems…';
  } else {
    processingTitle.textContent = 'Finalising…';
  }
}

// ─── Results Display ────────────────────────────────────────────────────────

function showResults() {
  processingSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  // Ensure AudioContext exists
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Render waveforms for each stem
  STEMS.forEach((stem) => {
    const canvas = $(`waveform-${stem}`);
    if (!canvas) return;

    const renderer = new WaveformRenderer(canvas, STEM_COLORS[stem]);
    waveformRenderers[stem] = renderer;

    // Render waveform from first channel (or mix of both)
    if (stems[stem] && stems[stem][0]) {
      renderer.render(stems[stem][0]);
    }
  });

  // Add animation class for entrance
  resultsSection.style.animation = 'fade-in-up 0.6s ease-out';

  // Handle window resize for waveforms
  window.addEventListener('resize', debounce(() => {
    STEMS.forEach((stem) => {
      if (waveformRenderers[stem]) {
        waveformRenderers[stem].draw();
      }
    });
  }, 250));
}

function setupResultsHandlers() {
  // Play/Pause buttons
  document.querySelectorAll('.play-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      togglePlay(stem);
    });
  });

  // Volume sliders
  document.querySelectorAll('.volume-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const stem = e.target.dataset.stem;
      const volume = parseInt(e.target.value) / 100;
      setVolume(stem, volume);
    });
  });

  // Solo buttons
  document.querySelectorAll('.solo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      toggleSolo(stem);
    });
  });

  // Mute buttons
  document.querySelectorAll('.mute-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      toggleMute(stem);
    });
  });

  // Download individual stem
  document.querySelectorAll('.download-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      downloadStem(stem);
    });
  });

  // Download all as ZIP
  downloadAllBtn.addEventListener('click', downloadAllStems);

  // New separation
  newSeparationBtn.addEventListener('click', () => {
    stopAllPlayback();
    resetToUpload();
  });
}

// ─── Playback Controls ──────────────────────────────────────────────────────

function togglePlay(stem) {
  if (playingState[stem]) {
    stopPlayback(stem);
  } else {
    startPlayback(stem);
  }
}

function startPlayback(stem) {
  if (!stems[stem] || !audioCtx) return;

  // Resume context if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const buffer = createAudioBuffer(stems[stem], decodedAudio.sampleRate);
  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();

  source.buffer = buffer;
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Apply current volume and mute state
  const effectiveVolume = getEffectiveVolume(stem);
  gainNode.gain.value = effectiveVolume;

  const startOffset = audioSources[stem]?.startOffset || 0;
  source.start(0, startOffset);

  audioSources[stem] = {
    source,
    gain: gainNode,
    startTime: audioCtx.currentTime - startOffset,
    startOffset,
    buffer,
  };

  playingState[stem] = true;
  updatePlayButton(stem, true);

  // Start waveform animation
  if (waveformRenderers[stem]) {
    waveformRenderers[stem].startAnimation(
      () => getCurrentTime(stem),
      buffer.duration
    );
  }

  // Handle playback end
  source.onended = () => {
    if (playingState[stem]) {
      playingState[stem] = false;
      audioSources[stem].startOffset = 0;
      updatePlayButton(stem, false);
      if (waveformRenderers[stem]) {
        waveformRenderers[stem].stopAnimation();
        waveformRenderers[stem].setPlaybackPosition(0);
      }
    }
  };
}

function stopPlayback(stem) {
  if (!audioSources[stem]) return;

  const { source } = audioSources[stem];
  audioSources[stem].startOffset = getCurrentTime(stem);

  // Prevent onended from firing
  source.onended = null;

  try {
    source.stop();
  } catch (_) {
    // Already stopped
  }

  playingState[stem] = false;
  updatePlayButton(stem, false);

  if (waveformRenderers[stem]) {
    waveformRenderers[stem].stopAnimation();
  }
}

function stopAllPlayback() {
  STEMS.forEach((stem) => stopPlayback(stem));
  isSyncPlaying = false;
}

function getCurrentTime(stem) {
  if (!audioSources[stem] || !audioCtx) return 0;
  const { startTime, buffer } = audioSources[stem];
  const elapsed = audioCtx.currentTime - startTime;
  return Math.min(elapsed, buffer.duration);
}

function updatePlayButton(stem, isPlaying) {
  const btn = $(`play-${stem}`);
  if (btn) {
    btn.textContent = isPlaying ? '⏸' : '▶';
    btn.classList.toggle('active', isPlaying);
  }
}

// ─── Volume & Mute ──────────────────────────────────────────────────────────

function setVolume(stem, volume) {
  volumeState[stem] = volume;
  applyVolume(stem);
}

function toggleMute(stem) {
  muteState[stem] = !muteState[stem];
  const btn = $(`mute-${stem}`);
  if (btn) btn.classList.toggle('active', muteState[stem]);
  applyVolume(stem);
}

function toggleSolo(stem) {
  const wasActive = soloState[stem];

  // If soloing, clear other solos; if unsoloing, clear this solo
  STEMS.forEach((s) => {
    soloState[s] = false;
    const btn = $(`solo-${s}`);
    if (btn) btn.classList.remove('active');
  });

  if (!wasActive) {
    soloState[stem] = true;
    const btn = $(`solo-${stem}`);
    if (btn) btn.classList.add('active');
  }

  // Update all volumes
  STEMS.forEach((s) => applyVolume(s));
}

function getEffectiveVolume(stem) {
  // If any solo is active, mute everything except the soloed stem
  const anySolo = STEMS.some((s) => soloState[s]);
  if (anySolo && !soloState[stem]) return 0;
  if (muteState[stem]) return 0;
  return volumeState[stem];
}

function applyVolume(stem) {
  if (audioSources[stem]?.gain) {
    audioSources[stem].gain.gain.setValueAtTime(
      getEffectiveVolume(stem),
      audioCtx.currentTime
    );
  }
}

// ─── Download ───────────────────────────────────────────────────────────────

function downloadStem(stem) {
  if (!stems[stem]) return;

  const wavBlob = encodeWav(stems[stem], decodedAudio.sampleRate);
  const baseName = currentFile.name.replace(/\.[^.]+$/, '');
  downloadBlob(wavBlob, `${baseName}_${stem}.wav`);
}

async function downloadAllStems() {
  if (!currentFile) return;

  const baseName = currentFile.name.replace(/\.[^.]+$/, '');

  // Check if JSZip is available, if not, download stems individually
  try {
    // Dynamically load JSZip from CDN
    if (!window.JSZip) {
      downloadAllBtn.textContent = '📦 Preparing ZIP…';
      downloadAllBtn.disabled = true;

      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip = new window.JSZip();
    const folder = zip.folder(baseName + '_stems');

    STEMS.forEach((stem) => {
      if (stems[stem]) {
        const wavBlob = encodeWav(stems[stem], decodedAudio.sampleRate);
        folder.file(`${stem}.wav`, wavBlob);
      }
    });

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }, // Fast compression for large audio
    }, (meta) => {
      downloadAllBtn.textContent = `📦 Zipping… ${meta.percent.toFixed(0)}%`;
    });

    downloadBlob(zipBlob, `${baseName}_stems.zip`);

  } catch (err) {
    console.warn('[StemSplit] ZIP failed, downloading individually:', err);
    STEMS.forEach((stem) => downloadStem(stem));

  } finally {
    downloadAllBtn.textContent = '📦 Download All as ZIP';
    downloadAllBtn.disabled = false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke after a delay
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── UI State Management ────────────────────────────────────────────────────

function resetToUpload() {
  // Destroy waveform renderers
  STEMS.forEach((stem) => {
    if (waveformRenderers[stem]) {
      waveformRenderers[stem].destroy();
      delete waveformRenderers[stem];
    }
    // Reset playback state
    playingState[stem] = false;
    muteState[stem] = false;
    soloState[stem] = false;
    volumeState[stem] = 1.0;
    delete audioSources[stem];

    // Reset UI
    updatePlayButton(stem, false);
    const muteBtn = $(`mute-${stem}`);
    if (muteBtn) muteBtn.classList.remove('active');
    const soloBtn = $(`solo-${stem}`);
    if (soloBtn) soloBtn.classList.remove('active');
    const volumeSlider = $(`volume-${stem}`);
    if (volumeSlider) volumeSlider.value = '100';
  });

  // Reset sections
  processingSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  heroSection.classList.remove('hidden');
  uploadSection.classList.remove('hidden');

  // Reset processing UI
  sepProgressBar.style.width = '0%';
  sepProgressText.textContent = '0%';

  resetUpload();
}

function showError(message) {
  // Create a toast-style error notification
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.innerHTML = `
    <span class="error-icon">⚠️</span>
    <span class="error-message">${message}</span>
    <button class="error-close" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('visible'));

  // Auto-remove after 6 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        // Toggle all stems play/pause
        if (resultsSection && !resultsSection.classList.contains('hidden')) {
          if (isSyncPlaying) {
            stopAllPlayback();
          } else {
            STEMS.forEach((stem) => {
              if (!playingState[stem]) startPlayback(stem);
            });
            isSyncPlaying = true;
          }
        }
        break;

      case '1': case '2': case '3': case '4':
        if (resultsSection && !resultsSection.classList.contains('hidden')) {
          const idx = parseInt(e.key) - 1;
          if (STEMS[idx]) toggleSolo(STEMS[idx]);
        }
        break;

      case 'Escape':
        stopAllPlayback();
        break;
    }
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Format byte count to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Create a debounced version of a function.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Dynamically load a script from a URL.
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

// ─── Start ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
