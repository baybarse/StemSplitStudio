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
import { extractLyrics } from './lyrics-extractor.js';
import { AudioRecorder } from './recorder.js';

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
const recorder = new AudioRecorder();

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

/** @type {Record<string, boolean>} Per-stem checkbox selection state. */
const selectedState = {};

/** @type {Array<{id: string, name: string, data: Float32Array[], blob: Blob, duration: number, isPlaying: boolean, volume: number, isMuted: boolean, isSelected: boolean}>} Recorded tracks. */
const recordedTracks = [];

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

// New actions
const downloadSelectedBtn = $('download-selected-btn');
const downloadMixBtn      = $('download-mix-btn');
const extractLyricsBtn    = $('extract-lyrics-btn');
const recordBtn           = $('record-btn');

// Lyrics section
const lyricsSection       = $('lyrics-section');
const lyricsContent       = $('lyrics-content');
const lyricsLoading       = $('lyrics-loading');
const lyricsProgressBar   = $('lyrics-progress-bar');
const lyricsProgressText  = $('lyrics-progress-text');
const lyricsStatus        = $('lyrics-loading-status');
const copyLyricsBtn       = $('copy-lyrics-btn');
const downloadLyricsBtn   = $('download-lyrics-btn');
const closeLyricsBtn      = $('close-lyrics-btn');
const lyricsLanguage      = $('lyrics-language');
const detectedLanguage    = $('detected-language');

// Recording section
const recordingSection    = $('recording-section');
const startRecordBtn      = $('start-record-btn');
const stopRecordBtn       = $('stop-record-btn');
const closeRecordingBtn   = $('close-recording-btn');
const recordingCanvas     = $('recording-canvas');
const recordingTime       = $('recording-time');
const recordedTracksDiv   = $('recorded-tracks');

// New DOM elements for Dashboard
const dashboardSection = $('dashboard-section');
const backToDashboardBtns = [$('back-to-dashboard-btn'), $('back-to-dashboard-btn-2')];
const mergerUploadSection = $('merger-upload-section');
const mergerFileInput = $('merger-file-input');
const mergerUploadArea = $('merger-upload-area');
const mergerFileList = $('merger-file-list');
const startMergerBtn = $('start-merger-btn');

/** @type {string|null} Current application mode ('splitter', 'lyrics', 'recorder', 'merger', 'full') */
let currentMode = null;
let mergerFiles = [];
let mergerVolumes = []; // Store custom volume settings for merger

// ─── Initialisation ─────────────────────────────────────────────────────────

function init() {
  // Init stem states
  STEMS.forEach((stem) => {
    playingState[stem] = false;
    muteState[stem]    = false;
    soloState[stem]    = false;
    volumeState[stem]  = 1.0;
    selectedState[stem] = true;
  });

  setupDashboardHandlers();
  setupUploadHandlers();
  setupMergerHandlers();
  setupResultsHandlers();
  setupLyricsHandlers();
  setupRecordingHandlers();
  setupKeyboardShortcuts();

  console.log('[StemSplit] App initialised');
}

function setupDashboardHandlers() {
  document.querySelectorAll('.dashboard-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      startMode(mode);
    });
  });

  backToDashboardBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', () => {
      resetToDashboard();
    });
  });
}

function startMode(mode) {
  currentMode = mode;
  dashboardSection.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if (mode === 'merger') {
    mergerUploadSection.classList.remove('hidden');
  } else {
    uploadSection.classList.remove('hidden');
    // Change upload text based on mode
    if (mode === 'lyrics') {
      $('.upload-title').textContent = 'Upload song for Lyrics Extraction';
    } else if (mode === 'recorder') {
      $('.upload-title').textContent = 'Upload backing track for Recording';
    } else {
      $('.upload-title').textContent = 'Drop your audio file here';
    }
  }
}

function resetToDashboard() {
  resetToUpload();
  uploadSection.classList.add('hidden');
  mergerUploadSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  currentMode = null;
}

function setupMergerHandlers() {
  if (!mergerUploadArea) return;
  
  mergerUploadArea.addEventListener('click', () => mergerFileInput.click());
  
  mergerFileInput.addEventListener('change', (e) => {
    handleMergerFiles(e.target.files);
  });
  
  startMergerBtn.addEventListener('click', () => {
    processMergerFiles();
  });
}

function handleMergerFiles(files) {
  for (let i = 0; i < files.length; i++) {
    mergerFiles.push(files[i]);
    mergerVolumes.push(1.0); // Default volume
  }
  
  renderMergerFileList();
}

function renderMergerFileList() {
  mergerFileList.innerHTML = '';
  mergerFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.padding = '0.75rem';
    div.style.background = 'rgba(255,255,255,0.05)';
    div.style.marginBottom = '0.5rem';
    div.style.borderRadius = '8px';
    
    div.innerHTML = `
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:1rem;">${f.name}</span>
      <div style="display:flex; align-items:center; gap:0.5rem;" title="Adjust Volume">
        <span>🔊</span>
        <input type="range" min="0" max="1" step="0.01" value="${mergerVolumes[i]}" oninput="window.updateMergerVolume(${i}, this.value)" style="width:100px;">
      </div>
      <button class="btn btn-secondary" style="padding:0.2rem 0.6rem; margin-left:1rem; border-radius:4px;" onclick="window.removeMergerFile(${i})">✕</button>
    `;
    mergerFileList.appendChild(div);
  });
  
  if (mergerFiles.length > 0) {
    const note = document.createElement('p');
    note.innerHTML = '💡 Your files will be mixed exactly according to the volume levels you set above.';
    note.style.textAlign = 'center';
    note.style.color = 'var(--color-text-secondary)';
    note.style.marginTop = '15px';
    note.style.fontSize = '0.95rem';
    mergerFileList.appendChild(note);
    
    startMergerBtn.classList.remove('hidden');
  } else {
    startMergerBtn.classList.add('hidden');
  }
}

window.removeMergerFile = (idx) => {
  mergerFiles.splice(idx, 1);
  mergerVolumes.splice(idx, 1);
  renderMergerFileList();
};

window.updateMergerVolume = (idx, value) => {
  mergerVolumes[idx] = parseFloat(value);
};

async function processMergerFiles() {
  try {
    mergerUploadSection.classList.add('hidden');
    processingSection.classList.remove('hidden');
    processingSection.classList.remove('hidden');
    
    updateProcessingUI(10, 'Decoding files...');
    
    const tracks = [];
    for (let i = 0; i < mergerFiles.length; i++) {
      updateProcessingUI(10 + (80 * (i / mergerFiles.length)), `Decoding ${mergerFiles[i].name}...`);
      const decoded = await decodeAudioFile(mergerFiles[i]);
      
      // Need AudioBuffer to pass to mixer
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = createAudioBuffer(decoded.channelData, decoded.sampleRate);
      
      tracks.push({ buffer: buffer, volume: mergerVolumes[i] });
    }
    
    updateProcessingUI(95, 'Mixing files...');
    
    // Dynamically import merger logic
    const { mixMultipleTracks } = await import('./audio-merger.js');
    const mixedBlob = await mixMultipleTracks(tracks, 44100);
    
    downloadBlob(mixedBlob, 'mixed_audio.wav');
    
    processingSection.classList.add('hidden');
    mergerUploadSection.classList.remove('hidden');
    mergerFiles = [];
    mergerVolumes = [];
    renderMergerFileList();
    mergerFileInput.value = '';
    
  } catch (err) {
    console.error('Merger failed:', err);
    showError(`Merger failed: ${err.message}`);
    resetToDashboard();
  }
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
    processingSection.classList.remove('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    lyricsSection.classList.add('hidden');
    recordingSection.classList.add('hidden');

    // Step 1: Decode audio
    updateProcessingUI(0, 'Decoding audio file…');
    decodedAudio = await decodeAudioFile(currentFile);
    updateProcessingUI(5, `Audio decoded: ${decodedAudio.duration.toFixed(1)}s, ${decodedAudio.sampleRate}Hz`);

    // Step 2: Stem Separation (Skip if Lyrics or Recorder mode)
    if (currentMode === 'lyrics' || currentMode === 'recorder') {
      updateProcessingUI(100, 'Ready!');
      // Mock stems with original audio for playback
      stems = {
        vocals: [decodedAudio.channelData[0], decodedAudio.channelData[1] || decodedAudio.channelData[0]],
        drums: null,
        bass: null,
        other: null
      };
    } else {
      // Load model (if not already loaded)
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

      // Separate stems
      updateProcessingUI(10, 'Starting stem separation…');
      stems = await processor.separate(decodedAudio, (percent, status) => {
        updateProcessingUI(percent, status);
      });
    }

    // Step 4: Show results
    showResults();

    // Step 5: Auto-trigger specific mode UI
    if (currentMode === 'lyrics') {
      setTimeout(() => extractLyricsBtn.click(), 500);
    } else if (currentMode === 'recorder') {
      setTimeout(() => recordBtn.click(), 500);
    }

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

  const resultsGrid = document.querySelector('.results-grid');
  const resultsActions = document.querySelector('.results-actions');
  const downloadOptions = document.querySelector('.download-options');

  // Mode specific UI adjustments
  if (currentMode === 'lyrics') {
    // Hide stem cards and unnecessary download options
    if (resultsGrid) resultsGrid.style.display = 'none';
    if (downloadOptions) downloadOptions.style.display = 'none';
    
    // Only show "Separate Another File" or specific actions
    const recordBtn = document.getElementById('record-btn');
    const extractLyricsBtn = document.getElementById('extract-lyrics-btn');
    if (recordBtn) recordBtn.style.display = 'none';
    if (extractLyricsBtn) extractLyricsBtn.style.display = 'none';
  } else if (currentMode === 'recorder') {
    // Hide stem cards, show recording UI
    if (resultsGrid) resultsGrid.style.display = 'none';
    if (downloadOptions) downloadOptions.style.display = 'none';
    
    const extractLyricsBtn = document.getElementById('extract-lyrics-btn');
    if (extractLyricsBtn) extractLyricsBtn.style.display = 'none';
  } else if (currentMode === 'splitter') {
    // Show stem cards, but hide lyrics/record buttons
    if (resultsGrid) resultsGrid.style.display = '';
    if (downloadOptions) downloadOptions.style.display = '';
    
    const recordBtn = document.getElementById('record-btn');
    const extractLyricsBtn = document.getElementById('extract-lyrics-btn');
    if (recordBtn) recordBtn.style.display = 'none';
    if (extractLyricsBtn) extractLyricsBtn.style.display = 'none';
  } else {
    // Full Studio: Show everything
    if (resultsGrid) resultsGrid.style.display = '';
    if (downloadOptions) downloadOptions.style.display = '';
    
    const recordBtn = document.getElementById('record-btn');
    const extractLyricsBtn = document.getElementById('extract-lyrics-btn');
    if (recordBtn) recordBtn.style.display = '';
    if (extractLyricsBtn) extractLyricsBtn.style.display = '';
  }

  // Ensure AudioContext exists
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Render waveforms for each stem
  STEMS.forEach((stem) => {
    const canvas = $(`waveform-${stem}`);
    const card = canvas ? canvas.closest('.stem-card') : null;
    
    if (!stems[stem]) {
      if (card) card.classList.add('hidden');
      return;
    }
    
    if (card) card.classList.remove('hidden');

    if (!canvas) return;

    const renderer = new WaveformRenderer(canvas, STEM_COLORS[stem]);
    waveformRenderers[stem] = renderer;

    // Render waveform from first channel (or mix of both)
    if (stems[stem] && stems[stem][0]) {
      renderer.render(stems[stem][0]);
    }

    // Listen for scrub/seek events
    canvas.addEventListener('seek', (e) => {
      const percentage = e.detail;
      if (decodedAudio) {
        const newTime = percentage * decodedAudio.duration;
        handleSeek(stem, newTime);
      }
    });
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
  // Checkboxes
  document.querySelectorAll('.stem-select').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const stem = e.target.dataset.stem;
      selectedState[stem] = e.target.checked;
    });
  });

  // Play/Pause buttons
  document.querySelectorAll('.play-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      togglePlay(stem);
    });
  });

  // Play Selected button
  const playSelectedBtn = document.getElementById('play-selected-btn');
  if (playSelectedBtn) {
    playSelectedBtn.addEventListener('click', () => {
      const selectedStems = STEMS.filter(stem => selectedState[stem]);
      if (selectedStems.length === 0) return;
      
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const isAnyPlaying = selectedStems.some(stem => playingState[stem]);
      
      if (isAnyPlaying) {
        selectedStems.forEach(stem => {
          if (playingState[stem]) stopPlayback(stem);
        });
        playSelectedBtn.innerHTML = '<span class="btn-icon" style="font-size: 1.2rem;">▶</span> Play Selected';
      } else {
        // Find highest current time among selected stems to sync them
        let syncTime = 0;
        selectedStems.forEach(stem => {
          const t = getCurrentTime(stem);
          if (t > syncTime) syncTime = t;
        });
        
        selectedStems.forEach(stem => {
          if (!audioSources[stem]) {
            audioSources[stem] = { startOffset: 0 };
          }
          audioSources[stem].startOffset = syncTime;
          
          if (waveformRenderers[stem] && decodedAudio) {
            waveformRenderers[stem].setPlaybackPosition(syncTime / decodedAudio.duration);
          }
          
          if (!playingState[stem]) startPlayback(stem);
        });
        playSelectedBtn.innerHTML = '<span class="btn-icon" style="font-size: 1.2rem;">⏸</span> Pause Selected';
      }
    });
  }

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

  // Download actions
  if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadAllStems);
  if (downloadSelectedBtn) downloadSelectedBtn.addEventListener('click', downloadSelectedStems);
  if (downloadMixBtn) downloadMixBtn.addEventListener('click', downloadMix);
  
  // Secondary actions
  if (newSeparationBtn) {
    newSeparationBtn.addEventListener('click', () => {
      stopAllPlayback();
      resetToUpload();
    });
  }

  const resultsBackDashboardBtn = document.getElementById('results-back-dashboard-btn');
  if (resultsBackDashboardBtn) {
    resultsBackDashboardBtn.addEventListener('click', () => {
      stopAllPlayback();
      resetToDashboard();
    });
  }
}

// ─── Lyrics Extraction ──────────────────────────────────────────────────────

let lyricsResult = null;

function setupLyricsHandlers() {
  if (extractLyricsBtn) {
    extractLyricsBtn.addEventListener('click', () => {
      lyricsSection.classList.remove('hidden');
      lyricsSection.scrollIntoView({ behavior: 'smooth' });
      
      if (!lyricsResult) {
        startLyricsExtraction();
      }
    });
  }

  if (closeLyricsBtn) {
    closeLyricsBtn.addEventListener('click', () => {
      lyricsSection.classList.add('hidden');
    });
  }

  if (copyLyricsBtn) {
    copyLyricsBtn.addEventListener('click', () => {
      // Prefer currently displayed text if translated
      const textToCopy = Array.from(lyricsContent.querySelectorAll('.lyrics-line, p'))
                              .map(el => el.textContent)
                              .join('\n');
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const original = copyLyricsBtn.innerHTML;
          copyLyricsBtn.innerHTML = '✅ Copied!';
          setTimeout(() => copyLyricsBtn.innerHTML = original, 2000);
        });
      }
    });
  }

  if (downloadLyricsBtn) {
    downloadLyricsBtn.addEventListener('click', () => {
      const textToDownload = Array.from(lyricsContent.querySelectorAll('.lyrics-line, p'))
                              .map(el => el.textContent)
                              .join('\n');
      if (textToDownload) {
        const blob = new Blob([textToDownload], { type: 'text/plain' });
        const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'lyrics';
        downloadBlob(blob, `${baseName}_lyrics.txt`);
      }
    });
  }

  const translateBtn = document.getElementById('translate-lyrics-btn');
  const targetLangSelect = document.getElementById('target-lang-select');
  if (translateBtn && targetLangSelect) {
    translateBtn.addEventListener('click', async () => {
      if (!lyricsResult || !lyricsResult.text) return;
      
      const originalText = translateBtn.innerHTML;
      translateBtn.innerHTML = '⏳ Translating...';
      translateBtn.disabled = true;
      
      try {
        const targetLang = targetLangSelect.value;
        await translateDisplayedLyrics(targetLang);
      } catch (err) {
        console.error('Translation failed:', err);
        showError('Translation failed. Please try again.');
      } finally {
        translateBtn.innerHTML = originalText;
        translateBtn.disabled = false;
      }
    });
  }
}

async function translateDisplayedLyrics(targetLang) {
  // If we have chunks, translate each line separately
  if (lyricsResult.chunks && lyricsResult.chunks.length > 0) {
    // Collect all texts to translate
    const lines = lyricsResult.chunks.map(chunk => chunk.text.trim()).filter(t => t.length > 0);
    if (lines.length === 0) return;
    
    // Group lines into chunks to avoid URL too long (max ~2000 chars)
    const translatedLines = [];
    const chunkSize = 10;
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize);
      const text = chunk.join('\n');
      
      // Call Google Translate Free API (gtx client)
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      // Parse response
      // data[0] contains array of parts: [ [translated, original, ...], ... ]
      const translatedPart = data[0].map(part => part[0]).join('');
      const splitted = translatedPart.split('\n');
      translatedLines.push(...splitted);
    }
    
    // Update DOM
    lyricsContent.innerHTML = '';
    lyricsResult.chunks.forEach((chunk, i) => {
      if (!chunk.text.trim()) return;
      const line = document.createElement('div');
      line.className = 'lyrics-line';
      const timeStart = formatTime(chunk.timestamp[0]);
      
      const transText = translatedLines[i] || chunk.text;
      line.innerHTML = `<span class="lyrics-timestamp">[${timeStart}]</span> ${transText}`;
      
      lyricsContent.appendChild(line);
    });
    
  } else {
    // Single block translation
    const text = lyricsResult.text;
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    const translatedText = data[0].map(part => part[0]).join('');
    lyricsContent.innerHTML = `<p>${translatedText}</p>`;
  }
}

async function startLyricsExtraction() {
  // Use vocals stem if available
  const audioData = stems.vocals ? stems.vocals[0] : (decodedAudio ? decodedAudio.channelData[0] : null);
  if (!audioData) {
    showError('No audio available to extract lyrics from.');
    return;
  }

  lyricsLoading.classList.remove('hidden');
  lyricsContent.classList.add('hidden');
  lyricsLanguage.classList.add('hidden');

  try {
    lyricsResult = await extractLyrics(audioData, decodedAudio.sampleRate, {
      onProgress: (info) => {
        lyricsStatus.textContent = info.status;
        if (info.progress !== undefined) {
          lyricsProgressBar.style.width = `${info.progress}%`;
          lyricsProgressText.textContent = `${info.progress.toFixed(0)}%`;
        }
      }
    });

    // Render lyrics
    lyricsLoading.classList.add('hidden');
    lyricsContent.classList.remove('hidden');
    lyricsLanguage.classList.remove('hidden');
    
    // Auto-detect language using Google Translate API
    try {
      const textSample = lyricsResult.text ? lyricsResult.text.substring(0, 100) : '';
      if (textSample) {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(textSample)}`);
        if (res.ok) {
          const data = await res.json();
          const detectedCode = data[2]; // e.g., 'tr', 'en', 'es'
          const langNames = new Intl.DisplayNames(['en'], { type: 'language' });
          const langName = langNames.of(detectedCode) || detectedCode;
          detectedLanguage.textContent = `${langName} (${detectedCode})`;
        } else {
          detectedLanguage.textContent = 'Unknown';
        }
      }
    } catch (e) {
      detectedLanguage.textContent = 'Auto-detect failed';
    }
    
    if (lyricsResult.chunks && lyricsResult.chunks.length > 0) {
      lyricsContent.innerHTML = '';
      lyricsResult.chunks.forEach(chunk => {
        if (!chunk.text.trim()) return;
        const line = document.createElement('div');
        line.className = 'lyrics-line';
        const timeStart = formatTime(chunk.timestamp[0]);
        line.innerHTML = `<span class="lyrics-timestamp">[${timeStart}]</span> ${chunk.text}`;
        
        lyricsContent.appendChild(line);
      });
    } else {
      lyricsContent.innerHTML = `<p>${lyricsResult.text || 'No lyrics found.'}</p>`;
    }
    
  } catch (err) {
    console.error('Lyrics extraction failed:', err);
    showError(`Lyrics extraction failed: ${err.message}`);
    lyricsLoading.classList.add('hidden');
    lyricsContent.classList.remove('hidden');
    lyricsContent.innerHTML = `<p class="lyrics-placeholder">Error extracting lyrics.</p>`;
  }
}

function formatTime(seconds) {
  if (!seconds) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Recording Studio ───────────────────────────────────────────────────────

let recordingTimer = null;

function setupRecordingHandlers() {
  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      recordingSection.classList.remove('hidden');
      recordingSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (closeRecordingBtn) {
    closeRecordingBtn.addEventListener('click', () => {
      if (recorder.isRecording) {
        recorder.cancel();
        stopRecordingTimer();
      }
      recordingSection.classList.add('hidden');
    });
  }

  if (startRecordBtn) {
    startRecordBtn.addEventListener('click', async () => {
      try {
        await recorder.start(recordingCanvas);
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = false;
        recordingSection.querySelector('.recording-panel').classList.add('recording-active');
        startRecordingTimer();
      } catch (err) {
        console.error('Failed to start recording:', err);
        showError(`Microphone access failed: ${err.message}`);
      }
    });
  }

  if (stopRecordBtn) {
    stopRecordBtn.addEventListener('click', async () => {
      try {
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
        recordingSection.querySelector('.recording-panel').classList.remove('recording-active');
        stopRecordingTimer();
        
        const result = await recorder.stop();
        addRecordedTrack(result);
        
      } catch (err) {
        console.error('Failed to stop recording:', err);
      }
    });
  }
}

function startRecordingTimer() {
  recordingTime.textContent = '00:00';
  recordingTimer = setInterval(() => {
    const elapsed = Math.floor(recorder.getElapsedTime());
    recordingTime.textContent = formatTime(elapsed);
  }, 1000);
}

function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function addRecordedTrack(recordingData) {
  const trackId = `track-${Date.now()}`;
  const trackName = `Recording ${recordedTracks.length + 1}`;
  
  recordedTracks.push({
    id: trackId,
    name: trackName,
    data: recordingData.channelData,
    sampleRate: recordingData.sampleRate,
    blob: recordingData.blob,
    duration: recordingData.duration,
    isPlaying: false,
    volume: 1.0,
    isMuted: false,
    isSelected: true
  });
  
  renderRecordedTracks();
}

function renderRecordedTracks() {
  recordedTracksDiv.innerHTML = '';
  
  recordedTracks.forEach(track => {
    const el = document.createElement('div');
    el.className = 'recorded-track';
    
    el.innerHTML = `
      <label class="stem-checkbox">
        <input type="checkbox" class="track-select" data-id="${track.id}" checked>
      </label>
      <div class="track-name">${track.name}</div>
      <div class="track-duration">${formatTime(track.duration)}</div>
      <button class="track-play-btn" data-id="${track.id}">▶</button>
      <input type="range" class="track-volume" data-id="${track.id}" min="0" max="100" value="100">
      <button class="track-download-btn" data-id="${track.id}">⬇</button>
      <button class="track-delete-btn" data-id="${track.id}">🗑</button>
    `;
    
    // Checkbox
    const cb = el.querySelector('.track-select');
    cb.checked = track.isSelected;
    cb.addEventListener('change', (e) => track.isSelected = e.target.checked);
    
    // Volume
    const vol = el.querySelector('.track-volume');
    vol.value = track.volume * 100;
    vol.addEventListener('input', (e) => track.volume = parseInt(e.target.value) / 100);
    
    // Download
    el.querySelector('.track-download-btn').addEventListener('click', () => {
      downloadBlob(track.blob, `${track.name}.webm`);
    });
    
    // Delete
    el.querySelector('.track-delete-btn').addEventListener('click', () => {
      const idx = recordedTracks.findIndex(t => t.id === track.id);
      if (idx !== -1) recordedTracks.splice(idx, 1);
      renderRecordedTracks();
    });
    
    // Play/Pause
    const playBtn = el.querySelector('.track-play-btn');
    playBtn.addEventListener('click', () => {
      if (track.isPlaying) {
        // Stop logic would go here (simplified for now)
        track.isPlaying = false;
        playBtn.textContent = '▶';
      } else {
        playTrack(track);
        playBtn.textContent = '⏸';
      }
    });
    
    recordedTracksDiv.appendChild(el);
  });
}

function playTrack(track) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  const buffer = createAudioBuffer(track.data, track.sampleRate);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  
  source.buffer = buffer;
  gain.gain.value = track.isMuted ? 0 : track.volume;
  
  source.connect(gain);
  gain.connect(audioCtx.destination);
  
  source.start(0);
  track.isPlaying = true;
  
  source.onended = () => {
    track.isPlaying = false;
    renderRecordedTracks();
  };
}

// ─── Playback Controls ──────────────────────────────────────────────────────

function togglePlay(stem) {
  if (playingState[stem]) {
    stopPlayback(stem);
  } else {
    startPlayback(stem);
  }
}

function handleSeek(targetStem, newTime) {
  const stemsToSeek = isSyncPlaying ? STEMS : [targetStem];
  
  stemsToSeek.forEach(stem => {
    if (!audioSources[stem]) {
      audioSources[stem] = { startOffset: 0 };
    }
    
    if (playingState[stem]) {
      stopPlayback(stem);
      audioSources[stem].startOffset = newTime;
      startPlayback(stem);
    } else {
      audioSources[stem].startOffset = newTime;
      if (waveformRenderers[stem] && decodedAudio) {
        waveformRenderers[stem].setPlaybackPosition(newTime / decodedAudio.duration);
      }
    }
  });
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
  const btn = document.getElementById(`play-${stem}`);
  if (btn) {
    btn.textContent = isPlaying ? '⏸' : '▶';
    btn.classList.toggle('active', isPlaying);
  }
  
  // Also update master play button if present
  const playSelectedBtn = document.getElementById('play-selected-btn');
  if (playSelectedBtn) {
    const isAnyPlaying = STEMS.some(s => playingState[s]);
    if (!isAnyPlaying) {
      playSelectedBtn.innerHTML = '<span class="btn-icon" style="font-size: 1.2rem;">▶</span> Play Selected';
    }
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
    if (!window.JSZip) {
      downloadAllBtn.innerHTML = '<span class="btn-icon">📦</span> Preparing ZIP…';
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
      compressionOptions: { level: 1 },
    }, (meta) => {
      downloadAllBtn.innerHTML = `<span class="btn-icon">📦</span> Zipping… ${meta.percent.toFixed(0)}%`;
    });

    downloadBlob(zipBlob, `${baseName}_stems.zip`);

  } catch (err) {
    console.warn('[StemSplit] ZIP failed, downloading individually:', err);
    STEMS.forEach((stem) => downloadStem(stem));
  } finally {
    downloadAllBtn.innerHTML = '<span class="btn-icon">📦</span> Download All as ZIP';
    downloadAllBtn.disabled = false;
  }
}

async function downloadSelectedStems() {
  if (!currentFile) return;

  const baseName = currentFile.name.replace(/\.[^.]+$/, '');
  
  // Find selected stems
  const selectedStems = STEMS.filter(stem => selectedState[stem]);
  
  if (selectedStems.length === 0) {
    showError("Please select at least one stem to download.");
    return;
  }

  if (selectedStems.length === 1) {
    // Only one selected, just download it directly
    downloadStem(selectedStems[0]);
    return;
  }

  // Zip the selected ones
  try {
    if (!window.JSZip) {
      downloadSelectedBtn.innerHTML = '<span class="btn-icon">⬇</span> Preparing ZIP…';
      downloadSelectedBtn.disabled = true;
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip = new window.JSZip();
    const folder = zip.folder(baseName + '_selected_stems');

    selectedStems.forEach((stem) => {
      if (stems[stem]) {
        const wavBlob = encodeWav(stems[stem], decodedAudio.sampleRate);
        folder.file(`${stem}.wav`, wavBlob);
      }
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${baseName}_selected.zip`);

  } catch (err) {
    console.warn('[StemSplit] ZIP failed, downloading individually:', err);
    selectedStems.forEach((stem) => downloadStem(stem));
  } finally {
    downloadSelectedBtn.innerHTML = '<span class="btn-icon">⬇</span> Download Selected';
    downloadSelectedBtn.disabled = false;
  }
}

async function downloadMix() {
  if (!currentFile || !decodedAudio) return;

  const baseName = currentFile.name.replace(/\.[^.]+$/, '');
  
  // Find selected stems
  const selectedStems = STEMS.filter(stem => selectedState[stem]);
  const selectedTracks = recordedTracks.filter(track => track.isSelected);
  
  if (selectedStems.length === 0 && selectedTracks.length === 0) {
    showError("Please select at least one stem or track to mix.");
    return;
  }

  downloadMixBtn.innerHTML = '<span class="btn-icon">🎵</span> Mixing...';
  downloadMixBtn.disabled = true;

  try {
    // Create a new offline context for mixing
    // Use the duration of the original audio for the mix
    const sampleRate = decodedAudio.sampleRate;
    const length = Math.floor(decodedAudio.duration * sampleRate);
    
    // We mix manually by adding Float32Arrays to avoid OfflineAudioContext 
    // rendering limits and resampler issues.
    
    const mixedL = new Float32Array(length);
    const mixedR = new Float32Array(length);
    
    // Mix stems
    selectedStems.forEach(stem => {
      if (!stems[stem]) return;
      const vol = getEffectiveVolume(stem); // Applies solo/mute logic
      
      const l = stems[stem][0];
      const r = stems[stem][1] || stems[stem][0]; // mono fallback
      
      for (let i = 0; i < length; i++) {
        mixedL[i] += (l[i] || 0) * vol;
        mixedR[i] += (r[i] || 0) * vol;
      }
    });
    
    // Mix recorded tracks
    // (Note: This is a simplified mix that just starts tracks from 0. 
    // Real DAWs allow positioning, but for this simple app they mix from start)
    for (const track of selectedTracks) {
      const vol = track.isMuted ? 0 : track.volume;
      const l = track.data[0];
      const r = track.data[1] || track.data[0];
      
      // Resample track if needed
      let trackL = l, trackR = r;
      if (track.sampleRate !== sampleRate) {
        // Simplified: using OfflineContext to resample recorded track would be better,
        // but for now we assume they match or we just add what we can
      }
      
      const trackLength = Math.min(length, trackL.length);
      for (let i = 0; i < trackLength; i++) {
        mixedL[i] += (trackL[i] || 0) * vol;
        mixedR[i] += (trackR[i] || 0) * vol;
      }
    }
    
    // Hard clipper to prevent distortion
    for (let i = 0; i < length; i++) {
      if (mixedL[i] > 1.0) mixedL[i] = 1.0;
      if (mixedL[i] < -1.0) mixedL[i] = -1.0;
      if (mixedR[i] > 1.0) mixedR[i] = 1.0;
      if (mixedR[i] < -1.0) mixedR[i] = -1.0;
    }
    
    const wavBlob = encodeWav([mixedL, mixedR], sampleRate);
    downloadBlob(wavBlob, `${baseName}_mix.wav`);
    
  } catch (err) {
    console.error('Mixdown failed:', err);
    showError(`Mixdown failed: ${err.message}`);
  } finally {
    downloadMixBtn.innerHTML = '<span class="btn-icon">🎵</span> Download as One Song';
    downloadMixBtn.disabled = false;
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
    selectedState[stem] = true;
    delete audioSources[stem];

    // Reset UI
    updatePlayButton(stem, false);
    const muteBtn = $(`mute-${stem}`);
    if (muteBtn) muteBtn.classList.remove('active');
    const soloBtn = $(`solo-${stem}`);
    if (soloBtn) soloBtn.classList.remove('active');
    const volumeSlider = $(`volume-${stem}`);
    if (volumeSlider) volumeSlider.value = '100';
    const checkbox = document.querySelector(`.stem-select[data-stem="${stem}"]`);
    if (checkbox) checkbox.checked = true;
  });

  // Clear tracks
  recordedTracks.length = 0;
  if (recordedTracksDiv) recordedTracksDiv.innerHTML = '';
  
  lyricsResult = null;

  // Reset sections
  processingSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  lyricsSection.classList.add('hidden');
  recordingSection.classList.add('hidden');
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

// ─── UI Updates ─────────────────────────────────────────────────────────────

function updateTimeDisplays() {
  if (decodedAudio) {
    const totalDuration = formatTime(decodedAudio.duration);
    STEMS.forEach(stem => {
      const timeDisplay = document.getElementById(`time-${stem}`);
      if (timeDisplay) {
        const time = getCurrentTime(stem);
        timeDisplay.textContent = `${formatTime(time)} / ${totalDuration}`;
      }
    });
  }
  requestAnimationFrame(updateTimeDisplays);
}

// Start UI update loop
requestAnimationFrame(updateTimeDisplays);
