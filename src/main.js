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
import { EFFECT_CATEGORIES, PRESETS, EffectsChain, renderWithEffects, getEffectParamDefs } from './audio-fx.js';

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
let originalStems = null;

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

/** @type {Record<string, EffectsChain>} Per-stem effects chain. */
const effectsChains = {};

/** @type {string|null} Currently open FX panel stem. */
let fxPanelStem = null;

/** @type {string|null} Currently active preset per stem. */
const activePreset = {};

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
  setupDawHandlers();
  setupFxHandlers();
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
  const heroSection = document.getElementById('hero-section');
  const featuresSection = document.getElementById('features-section');
  if (heroSection) heroSection.classList.add('hidden');
  if (featuresSection) featuresSection.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if (mode === 'full') {
    const modal = document.getElementById('full-studio-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Move sections to daw-workspace
    const workspace = document.getElementById('daw-workspace-container');
    if (uploadSection && workspace) workspace.appendChild(uploadSection);
    if (processingSection && workspace) workspace.appendChild(processingSection);
    if (resultsSection && workspace) workspace.appendChild(resultsSection);
    if (lyricsSection && workspace) workspace.appendChild(lyricsSection);
    if (recordingSection && workspace) workspace.appendChild(recordingSection);
    if (mergerUploadSection && workspace) workspace.appendChild(mergerUploadSection);
    
    uploadSection.classList.remove('hidden');
    mergerUploadSection.classList.add('hidden');
    
    // Switch to first tab naturally
    const tabs = document.querySelectorAll('.daw-tab');
    if (tabs.length > 0) {
      tabs.forEach(t => t.classList.remove('active'));
      tabs[0].classList.add('active');
    }
    return;
  }
  
  if (mode === 'merger') {
    mergerUploadSection.classList.remove('hidden');
  } else {
    uploadSection.classList.remove('hidden');
    // Change upload text based on mode
    if (mode === 'lyrics') {
      const t = document.querySelector('.upload-title');
      if (t) t.textContent = 'Upload song for Lyrics Extraction';
    } else if (mode === 'recorder') {
      const t = document.querySelector('.upload-title');
      if (t) t.textContent = 'Upload backing track for Recording';
    } else {
      const t = document.querySelector('.upload-title');
      if (t) t.textContent = 'Drop your audio file here';
    }
  }
}

function closeFullStudio() {
  const modal = document.getElementById('full-studio-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  
  const main = document.querySelector('.container') || document.body; // Actually, sections were directly in <div id="app"> except some
  const appContainer = document.getElementById('app') || document.body;
  
  // To be safe, put them back where they usually live
  if (uploadSection) appContainer.appendChild(uploadSection);
  if (mergerUploadSection) appContainer.appendChild(mergerUploadSection);
  if (processingSection) appContainer.appendChild(processingSection);
  if (resultsSection) appContainer.appendChild(resultsSection);
  if (recordingSection) appContainer.appendChild(recordingSection);
  if (lyricsSection) appContainer.appendChild(lyricsSection);
  
  const heroSection = document.getElementById('hero-section');
  const featuresSection = document.getElementById('features-section');
  if (heroSection) heroSection.classList.remove('hidden');
  if (featuresSection) featuresSection.classList.remove('hidden');
  
  resetToDashboard();
}

function resetToDashboard() {
  resetToUpload();
  uploadSection.classList.add('hidden');
  mergerUploadSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  currentMode = null;
}

// Setup DAW handlers
function setupDawHandlers() {
  const closeBtn = document.getElementById('close-studio-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeFullStudio);
  }
  
  document.querySelectorAll('.daw-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.daw-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      // We don't hide everything because DAW is an all-in-one view, 
      // but we could scroll to the section if we want.
      const tabName = e.target.dataset.tab;
      let targetSection = null;
      if (tabName === 'split') targetSection = resultsSection;
      if (tabName === 'lyrics') targetSection = lyricsSection;
      if (tabName === 'record') targetSection = recordingSection;
      
      if (targetSection && !targetSection.classList.contains('hidden')) {
        targetSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
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
    updateProcessingUI(0, 'Decoding audio file ');
    
    // Fun facts interval
    const facts = [
      `File size: ${(currentFile.size / 1024 / 1024).toFixed(2)} MB`,
      `Format: ${currentFile.type || 'audio/wav'}`,
      "Demucs AI is analyzing frequencies...",
      "Isolating vocal harmonics...",
      "Separating drum transients...",
      "Extracting bass frequencies...",
      "Preparing WebGPU acceleration...",
      "Almost there..."
    ];
    let factIdx = 0;
    const factsEl = document.getElementById('processing-facts');
    if (factsEl) factsEl.textContent = `File name: ${currentFile.name}`;
    
    const factsInterval = setInterval(() => {
      if (factsEl) {
        factsEl.textContent = facts[factIdx % facts.length];
        factIdx++;
      }
    }, 3500);

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

    // Backup for Undo functionality
    originalStems = {};
    STEMS.forEach(stem => {
      if (stems[stem]) {
        originalStems[stem] = [
          new Float32Array(stems[stem][0]),
          stems[stem][1] ? new Float32Array(stems[stem][1]) : null
        ];
      }
    });

    // Step 4: Show results
    if (typeof factsInterval !== 'undefined') clearInterval(factsInterval);
    if (factsEl) factsEl.textContent = '';
    showResults();

    // Step 5: Auto-trigger specific mode UI
    if (currentMode === 'lyrics') {
      setTimeout(() => extractLyricsBtn.click(), 500);
    } else if (currentMode === 'recorder') {
      setTimeout(() => recordBtn.click(), 500);
    }

  } catch (err) {
    if (typeof factsInterval !== 'undefined') clearInterval(factsInterval);
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
        
        const { start, end } = getTrimRegion();
        if (syncTime < start) syncTime = start;
        if (syncTime >= end) syncTime = start;
        
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
        
        // Also play selected tracks
        const selectedTracks = recordedTracks.filter(track => track.isSelected);
        selectedTracks.forEach(track => {
          if (track.isPlaying && track.source) track.source.stop();
          playTrack(track, syncTime);
          const btn = document.querySelector(`.track-play-btn[data-id="${track.id}"]`);
          if (btn) btn.textContent = '⏸';
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
  
  const downloadMixBtnStudio = document.getElementById('download-mix-btn-studio');
  if (downloadMixBtnStudio) downloadMixBtnStudio.addEventListener('click', downloadMix);
  
  const newSeparationBtn = document.getElementById('new-separation-btn');
  if (newSeparationBtn) {
    newSeparationBtn.addEventListener('click', () => {
      stopAllPlayback();
      resetToUpload();
    });
  }

  // Region Editing (Isolate / Mute / Undo)
  const isolateBtn = document.getElementById('trim-isolate-btn');
  const muteBtn = document.getElementById('trim-mute-btn');
  const undoBtn = document.getElementById('trim-undo-btn');

  function applyRegionEdit(isMute) {
    if (!decodedAudio) return;
    const { start, end } = getTrimRegion();
    if (start <= 0 && end >= decodedAudio.duration) return;
    
    const startSample = Math.floor(start * decodedAudio.sampleRate);
    const endSample = Math.floor(Math.min(end, decodedAudio.duration) * decodedAudio.sampleRate);
    
    let applied = false;

    STEMS.forEach(stem => {
      if (stems[stem] && selectedState[stem]) {
        applied = true;
        
        // Stop playback if playing
        if (playingState[stem]) stopPlayback(stem);
        
        // Mutate array in-place
        for (let channel = 0; channel < stems[stem].length; channel++) {
          if (!stems[stem][channel]) continue;
          const data = stems[stem][channel];
          
          for (let i = 0; i < data.length; i++) {
            const inRegion = (i >= startSample && i <= endSample);
            if (isMute) {
              if (inRegion) data[i] = 0.0;
            } else { // Isolate
              if (!inRegion) data[i] = 0.0;
            }
          }
        }
        
        // Redraw waveform
        if (waveformRenderers[stem]) {
          const buffer = createAudioBuffer(stems[stem], decodedAudio.sampleRate);
          waveformRenderers[stem].draw(buffer.getChannelData(0));
        }
      }
    });

    if (applied) {
      if (undoBtn) undoBtn.disabled = false;
      showError(isMute ? "Region muted for selected stems!" : "Region isolated for selected stems!");
    } else {
      showError("Please select at least one stem to edit.");
    }
  }

  if (isolateBtn) isolateBtn.addEventListener('click', () => applyRegionEdit(false));
  if (muteBtn) muteBtn.addEventListener('click', () => applyRegionEdit(true));

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (!originalStems || !decodedAudio) return;
      
      stopAllPlayback();
      
      STEMS.forEach(stem => {
        if (originalStems[stem] && stems[stem]) {
          // Restore from backup
          stems[stem][0].set(originalStems[stem][0]);
          if (stems[stem][1] && originalStems[stem][1]) {
            stems[stem][1].set(originalStems[stem][1]);
          }
          
          // Redraw
          if (waveformRenderers[stem]) {
            const buffer = createAudioBuffer(stems[stem], decodedAudio.sampleRate);
            waveformRenderers[stem].draw(buffer.getChannelData(0));
          }
        }
      });
      
      undoBtn.disabled = true;
      showError("All stems restored to original state!");
    });
  }

  // Waveform Clicking (Seek)
  document.querySelectorAll('.waveform-canvas').forEach(canvas => {
    canvas.addEventListener('click', (e) => {
      const stem = e.target.id.replace('waveform-', '');
      if (!decodedAudio || !stems[stem]) return;
      
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / canvas.width));
      const newTime = percentage * decodedAudio.duration;
      
      const wasPlaying = playingState[stem];
      if (wasPlaying) stopPlayback(stem);
      
      if (!audioSources[stem]) {
        audioSources[stem] = { startOffset: newTime };
      } else {
        audioSources[stem].startOffset = newTime;
        delete audioSources[stem].startTime;
      }
      
      if (waveformRenderers[stem]) {
        waveformRenderers[stem].setPlaybackPosition(percentage);
      }
      
      if (wasPlaying) startPlayback(stem);
    });
  });

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
  if (isNaN(seconds) || seconds === undefined || seconds === null) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseFloat(timeStr);
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
        currentRecordingStartTime = getGlobalPlaybackTime();
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
        result.startTime = currentRecordingStartTime;
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
    startTime: recordingData.startTime || 0,
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
    const downloadBtn = el.querySelector('.track-download-btn');
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.textContent = '⏳';
      downloadBtn.disabled = true;
      
      // Let UI update
      await new Promise(r => setTimeout(r, 50));
      
      try {
        const wavBlob = encodeWav(track.data, track.sampleRate);
        downloadBlob(wavBlob, `${track.name}.wav`);
      } catch (err) {
        showError("Failed to download track: " + err.message);
      } finally {
        downloadBtn.textContent = '⬇';
        downloadBtn.disabled = false;
      }
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
        if (track.source) {
          track.source.stop();
          track.source.disconnect();
        }
        track.isPlaying = false;
        playBtn.textContent = '▶';
      } else {
        playTrack(track, null);
        playBtn.textContent = '⏸';
      }
    });
    
    recordedTracksDiv.appendChild(el);
  });
}

function playTrack(track, globalSyncTime = null) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  const buffer = createAudioBuffer(track.data, track.sampleRate);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  
  source.buffer = buffer;
  gain.gain.value = track.isMuted ? 0 : track.volume;
  
  source.connect(gain);
  gain.connect(audioCtx.destination);
  
  let delay = 0;
  let offset = 0;
  
  if (globalSyncTime !== null) {
    if (globalSyncTime < track.startTime) {
      delay = track.startTime - globalSyncTime;
    } else {
      offset = globalSyncTime - track.startTime;
    }
  }
  
  if (offset >= track.duration) return null;
  
  source.start(audioCtx.currentTime + delay, offset);
  
  track.source = source;
  track.gain = gain;
  track.isPlaying = true;
  
  source.onended = () => {
    track.isPlaying = false;
    renderRecordedTracks();
  };
  
  return source;
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

  // Apply current volume and mute state
  const effectiveVolume = getEffectiveVolume(stem);
  gainNode.gain.value = effectiveVolume;

  // Route through effects chain if active
  const chain = effectsChains[stem];
  if (chain && chain.hasActiveEffects()) {
    chain.connect(source, gainNode);
  } else {
    source.connect(gainNode);
  }
  gainNode.connect(audioCtx.destination);

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
      // Cleanup FX chain nodes
      if (effectsChains[stem]) effectsChains[stem].cleanup();
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

  // Cleanup FX chain nodes
  if (effectsChains[stem]) effectsChains[stem].cleanup();

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
  if (!playingState[stem]) return audioSources[stem].startOffset || 0;
  
  const { startTime, buffer } = audioSources[stem];
  if (startTime === undefined) return audioSources[stem].startOffset || 0;
  
  const elapsed = audioCtx.currentTime - startTime;
  return Math.max(0, Math.min(elapsed, buffer.duration));
}

function getGlobalPlaybackTime() {
  const activeStem = STEMS.find(s => playingState[s]);
  if (activeStem) return getCurrentTime(activeStem);
  
  const anyStem = STEMS.find(s => stems[s]);
  return anyStem ? getCurrentTime(anyStem) : 0;
}

let currentRecordingStartTime = 0;

function getTrimRegion() {
  const startInput = document.getElementById('trim-start');
  const endInput = document.getElementById('trim-end');
  
  let start = parseTime(startInput ? startInput.value : '');
  let end = parseTime(endInput ? endInput.value : '');
  
  if (start === null || isNaN(start)) start = 0;
  if (end === null || isNaN(end) || end <= start) {
    end = decodedAudio ? decodedAudio.duration : Infinity;
  }
  
  return { start, end };
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

async function downloadStem(stem, downloadDirectly = true, withFx = true) {
  if (!stems[stem]) return null;
  
  const { start, end } = getTrimRegion();
  const startSample = Math.floor(start * decodedAudio.sampleRate);
  const endSample = Math.floor(Math.min(end, decodedAudio.duration) * decodedAudio.sampleRate);
  const length = endSample - startSample;
  
  const stemData = stems[stem];
  const volume = getEffectiveVolume(stem);
  
  // Create a new Float32Array to hold the cropped and volume-adjusted data
  let processedData = [
    new Float32Array(length),
    new Float32Array(length)
  ];
  
  for (let i = 0; i < length; i++) {
    const srcIndex = startSample + i;
    processedData[0][i] = (stemData[0][srcIndex] || 0) * volume;
    processedData[1][i] = stemData[1] ? (stemData[1][srcIndex] || 0) * volume : processedData[0][i];
  }

  // Apply effects if active
  const chain = effectsChains[stem];
  if (withFx && chain && chain.hasActiveEffects()) {
    try {
      processedData = await renderWithEffects(processedData, decodedAudio.sampleRate, chain.effects);
    } catch (err) {
      console.warn(`[FX] Offline render failed for ${stem}:`, err);
    }
  }

  const wavBlob = encodeWav(processedData, decodedAudio.sampleRate);
  
  if (downloadDirectly) {
    const baseName = currentFile.name.replace(/\.[^.]+$/, '');
    const suffix = (withFx && chain && chain.hasActiveEffects()) ? '_fx' : '';
    downloadBlob(wavBlob, `${baseName}_${stem}${suffix}.wav`);
  }
  
  return wavBlob;
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

    for (const stem of STEMS) {
      if (stems[stem]) {
        const wavBlob = await downloadStem(stem, false);
        folder.file(`${baseName}_${stem}.wav`, wavBlob);
      }
    }

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

    for (const stem of selectedStems) {
      if (stems[stem]) {
        const wavBlob = await downloadStem(stem, false);
        folder.file(`${stem}.wav`, wavBlob);
      }
    }

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

  downloadMixBtn.innerHTML = '<span class="btn-icon">🎛️</span> Mixing...';
  downloadMixBtn.disabled = true;
  
  const studioBtn = document.getElementById('download-mix-btn-studio');
  if (studioBtn) {
    studioBtn.innerHTML = '<div style="font-size: 1.1rem; font-weight: 600;"><span class="btn-icon">⏳</span> Mixing...</div><div style="font-size: 0.8rem; font-weight: normal; opacity: 0.8; margin-top: 0.25rem;">Please wait</div>';
    studioBtn.disabled = true;
  }

  try {
    // Determine mix length to accommodate long recordings
    let mixDuration = decodedAudio.duration;
    for (const track of selectedTracks) {
      const trackEndTime = (track.startTime || 0) + track.duration;
      if (trackEndTime > mixDuration) {
        mixDuration = trackEndTime;
      }
    }
    
    const sampleRate = decodedAudio.sampleRate;
    const length = Math.floor(mixDuration * sampleRate);
    
    // We mix manually by adding Float32Arrays
    const mixedL = new Float32Array(length);
    const mixedR = new Float32Array(length);
    
    // Mix stems (with FX applied via offline rendering)
    for (const stem of selectedStems) {
      if (!stems[stem]) continue;
      const vol = getEffectiveVolume(stem); // Applies solo/mute logic
      
      let stemData = stems[stem];
      
      // Render effects offline if active
      const chain = effectsChains[stem];
      if (chain && chain.hasActiveEffects()) {
        try {
          stemData = await renderWithEffects(stemData, sampleRate, chain.effects);
        } catch (err) {
          console.warn(`[FX] Offline render failed for ${stem} during mixdown:`, err);
        }
      }
      
      const l = stemData[0];
      const r = stemData[1] || stemData[0]; // mono fallback
      
      for (let i = 0; i < length; i++) {
        if (i < l.length) {
          mixedL[i] += (l[i] || 0) * vol;
          mixedR[i] += (r[i] || 0) * vol;
        }
      }
    }
    
    // Mix recorded tracks with time alignment
    for (const track of selectedTracks) {
      const vol = track.isMuted ? 0 : track.volume;
      const l = track.data[0];
      const r = track.data[1] || track.data[0];
      
      const startSampleOffset = Math.floor((track.startTime || 0) * sampleRate);
      const trackLength = l.length;
      
      for (let i = 0; i < trackLength; i++) {
        const outIdx = startSampleOffset + i;
        if (outIdx >= 0 && outIdx < length) {
          mixedL[outIdx] += (l[i] || 0) * vol;
          mixedR[outIdx] += (r[i] || 0) * vol;
        }
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
    downloadMixBtn.innerHTML = '<span class="btn-icon">🎛️</span> Download Custom Mix';
    downloadMixBtn.disabled = false;
    
    if (studioBtn) {
      studioBtn.innerHTML = '<div style="font-size: 1.1rem; font-weight: 600;"><span class="btn-icon">🎛️</span> Download Custom Mix</div><div style="font-size: 0.8rem; font-weight: normal; opacity: 0.8; margin-top: 0.25rem;">(Includes Stems & Recordings)</div>';
      studioBtn.disabled = false;
    }
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
  
  // Reset FX chains
  STEMS.forEach((stem) => {
    if (effectsChains[stem]) {
      effectsChains[stem].cleanup();
      effectsChains[stem].clearAll();
    }
    activePreset[stem] = null;
    const fxBtn = document.getElementById(`fx-${stem}`);
    if (fxBtn) fxBtn.classList.remove('has-effects');
  });
  fxPanelStem = null;
  
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

// ─── Audio Effects (FX) Panel ───────────────────────────────────────────────

function setupFxHandlers() {
  // FX buttons on stem cards
  document.querySelectorAll('.fx-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stem = btn.dataset.stem;
      openFxPanel(stem);
    });
  });

  // Close button
  const closeBtn = document.getElementById('fx-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeFxPanel);

  // Overlay click to close
  const overlay = document.getElementById('fx-panel-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeFxPanel();
    });
  }

  // Reset all
  const resetBtn = document.getElementById('fx-reset-all-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!fxPanelStem) return;
      const chain = effectsChains[fxPanelStem];
      if (chain) {
        chain.cleanup();
        chain.clearAll();
      }
      activePreset[fxPanelStem] = null;
      updateFxButtonState(fxPanelStem);
      renderFxPanel(fxPanelStem);

      // Restart playback to reflect changes
      if (playingState[fxPanelStem]) {
        stopPlayback(fxPanelStem);
        startPlayback(fxPanelStem);
      }
    });
  }

  // Download with FX
  const downloadWithBtn = document.getElementById('fx-download-with-btn');
  if (downloadWithBtn) {
    downloadWithBtn.addEventListener('click', async () => {
      if (!fxPanelStem || !stems[fxPanelStem]) return;
      downloadWithBtn.innerHTML = '<span class="btn-icon">⏳</span> Rendering FX...';
      downloadWithBtn.disabled = true;
      try {
        await downloadStem(fxPanelStem, true, true);
      } finally {
        downloadWithBtn.innerHTML = '<span class="btn-icon">⬇</span> Download with FX';
        downloadWithBtn.disabled = false;
      }
    });
  }

  // Download without FX
  const downloadWithoutBtn = document.getElementById('fx-download-without-btn');
  if (downloadWithoutBtn) {
    downloadWithoutBtn.addEventListener('click', async () => {
      if (!fxPanelStem || !stems[fxPanelStem]) return;
      await downloadStem(fxPanelStem, true, false);
    });
  }
}

function openFxPanel(stem) {
  fxPanelStem = stem;

  // Ensure AudioContext and EffectsChain exist
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!effectsChains[stem]) {
    effectsChains[stem] = new EffectsChain(audioCtx);
  }

  // Update header
  const badge = document.getElementById('fx-panel-stem-badge');
  if (badge) {
    const stemNames = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other' };
    badge.textContent = stemNames[stem] || stem;
    badge.setAttribute('data-stem', stem);
  }

  renderFxPanel(stem);

  const overlay = document.getElementById('fx-panel-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function closeFxPanel() {
  const overlay = document.getElementById('fx-panel-overlay');
  if (overlay) overlay.classList.add('hidden');
  fxPanelStem = null;
}

function renderFxPanel(stem) {
  const chain = effectsChains[stem];
  if (!chain) return;

  // Determine effect type: vocals get vocal effects, everything else gets instrument effects
  const effectType = stem === 'vocals' ? 'vocals' : 'instruments';
  const effects = EFFECT_CATEGORIES[effectType];
  const presets = PRESETS[effectType];

  // ── Render Presets ──
  const presetsGrid = document.getElementById('fx-presets-grid');
  if (presetsGrid) {
    presetsGrid.innerHTML = '';
    const INITIAL_COUNT = 7;
    const isExpanded = presetsGrid.dataset.expanded === 'true';
    const visiblePresets = isExpanded ? presets : presets.slice(0, INITIAL_COUNT);

    visiblePresets.forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'fx-preset-btn' + (activePreset[stem] === preset.id ? ' active' : '');
      btn.innerHTML = `<span class="fx-preset-icon">${preset.icon}</span> ${preset.name}`;
      btn.addEventListener('click', () => {
        applyPreset(stem, preset);
        // Preserve expanded state
        const wasExpanded = presetsGrid.dataset.expanded === 'true';
        renderFxPanel(stem);
        if (wasExpanded) presetsGrid.dataset.expanded = 'true';
        // Re-render with expanded state
        if (wasExpanded) {
          const grid = document.getElementById('fx-presets-grid');
          if (grid) { grid.dataset.expanded = 'true'; renderFxPresets(stem); }
        }
        if (playingState[stem]) {
          stopPlayback(stem);
          startPlayback(stem);
        }
      });
      presetsGrid.appendChild(btn);
    });

    // "More" / "Less" button
    if (presets.length > INITIAL_COUNT) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'fx-preset-btn fx-preset-more-btn';
      if (isExpanded) {
        moreBtn.innerHTML = '<span class="fx-preset-icon">▴</span> Less';
      } else {
        moreBtn.innerHTML = `<span class="fx-preset-icon">▾</span> More (${presets.length - INITIAL_COUNT})`;
      }
      moreBtn.addEventListener('click', () => {
        presetsGrid.dataset.expanded = isExpanded ? 'false' : 'true';
        renderFxPresets(stem);
      });
      presetsGrid.appendChild(moreBtn);
    }
  }

  // ── Render Effects List ──
  const effectsList = document.getElementById('fx-effects-list');
  if (!effectsList) return;
  effectsList.innerHTML = '';

  let lastCategory = '';

  effects.forEach((effectDef) => {
    // Category divider
    if (effectDef.category !== lastCategory) {
      lastCategory = effectDef.category;
      const divider = document.createElement('div');
      divider.className = 'fx-category-divider';
      divider.innerHTML = `<span class="fx-category-label">${effectDef.category}</span>`;
      effectsList.appendChild(divider);
    }

    const existingEffect = chain.effects.get(effectDef.id);
    const isEnabled = existingEffect ? existingEffect.enabled : false;
    const currentParams = existingEffect ? existingEffect.params : { ...effectDef.params };

    const card = document.createElement('div');
    card.className = 'fx-effect-card' + (isEnabled ? ' active' : '');
    card.dataset.effectId = effectDef.id;

    // Header
    const header = document.createElement('div');
    header.className = 'fx-effect-header';

    const icon = document.createElement('span');
    icon.className = 'fx-effect-icon';
    icon.textContent = effectDef.icon;

    const name = document.createElement('span');
    name.className = 'fx-effect-name';
    name.textContent = effectDef.name;

    const categoryLabel = document.createElement('span');
    categoryLabel.className = 'fx-effect-category';
    categoryLabel.textContent = effectDef.category;

    const toggle = document.createElement('label');
    toggle.className = 'fx-toggle';
    toggle.innerHTML = `<input type="checkbox" ${isEnabled ? 'checked' : ''}><span class="fx-toggle-slider"></span>`;

    const checkbox = toggle.querySelector('input');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const enabled = e.target.checked;
      chain.setEffect(effectDef.id, enabled, currentParams);
      card.classList.toggle('active', enabled);
      activePreset[stem] = null; // Clear preset since user manually changed

      updateFxButtonState(stem);

      // Restart playback to apply change
      if (playingState[stem]) {
        stopPlayback(stem);
        startPlayback(stem);
      }

      // Update presets UI
      document.querySelectorAll('.fx-preset-btn').forEach(b => b.classList.remove('active'));
    });

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(categoryLabel);
    header.appendChild(toggle);

    // Click header to expand/collapse (besides toggle)
    header.addEventListener('click', (e) => {
      if (e.target.closest('.fx-toggle')) return;
      card.classList.toggle('active');
    });

    card.appendChild(header);

    // Parameters
    const paramDefs = getEffectParamDefs(effectDef.id);
    if (paramDefs.length > 0) {
      const paramsDiv = document.createElement('div');
      paramsDiv.className = 'fx-effect-params';

      paramDefs.forEach((pDef) => {
        const row = document.createElement('div');
        row.className = 'fx-param-row';

        const label = document.createElement('span');
        label.className = 'fx-param-label';
        label.textContent = pDef.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'fx-param-slider';
        slider.min = pDef.min;
        slider.max = pDef.max;
        slider.step = pDef.step;
        slider.value = currentParams[pDef.key] !== undefined ? currentParams[pDef.key] : pDef.min;

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'fx-param-value';
        valueDisplay.textContent = formatParamValue(slider.value, pDef);

        slider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          currentParams[pDef.key] = val;
          valueDisplay.textContent = formatParamValue(val, pDef);

          // Update chain
          chain.setEffect(effectDef.id, checkbox.checked, currentParams);
          if (checkbox.checked) {
            chain.updateParams(effectDef.id, { [pDef.key]: val });
          }
          activePreset[stem] = null;
          document.querySelectorAll('.fx-preset-btn').forEach(b => b.classList.remove('active'));
        });

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(valueDisplay);
        paramsDiv.appendChild(row);
      });

      card.appendChild(paramsDiv);
    }

    effectsList.appendChild(card);
  });
}

function applyPreset(stem, preset) {
  const chain = effectsChains[stem];
  if (!chain) return;

  const effectType = stem === 'vocals' ? 'vocals' : 'instruments';
  const allEffects = EFFECT_CATEGORIES[effectType];

  // First disable everything
  chain.cleanup();
  chain.clearAll();

  // Enable effects from preset
  if (preset.id === 'clean') {
    activePreset[stem] = 'clean';
    updateFxButtonState(stem);
    return;
  }

  for (const [effectId, params] of Object.entries(preset.effects)) {
    // Find default params for this effect
    const effectDef = allEffects.find(e => e.id === effectId);
    const mergedParams = { ...(effectDef ? effectDef.params : {}), ...params };
    chain.setEffect(effectId, true, mergedParams);
  }

  activePreset[stem] = preset.id;
  updateFxButtonState(stem);
}
/**
 * Re-renders only the presets grid (without touching effects list).
 */
function renderFxPresets(stem) {
  const effectType = stem === 'vocals' ? 'vocals' : 'instruments';
  const presets = PRESETS[effectType];
  const presetsGrid = document.getElementById('fx-presets-grid');
  if (!presetsGrid) return;

  const INITIAL_COUNT = 7;
  const isExpanded = presetsGrid.dataset.expanded === 'true';
  const visiblePresets = isExpanded ? presets : presets.slice(0, INITIAL_COUNT);

  presetsGrid.innerHTML = '';

  visiblePresets.forEach((preset) => {
    const btn = document.createElement('button');
    btn.className = 'fx-preset-btn' + (activePreset[stem] === preset.id ? ' active' : '');
    btn.innerHTML = `<span class="fx-preset-icon">${preset.icon}</span> ${preset.name}`;
    btn.addEventListener('click', () => {
      applyPreset(stem, preset);
      const wasExpanded = presetsGrid.dataset.expanded === 'true';
      renderFxPanel(stem);
      if (wasExpanded) {
        const grid = document.getElementById('fx-presets-grid');
        if (grid) { grid.dataset.expanded = 'true'; renderFxPresets(stem); }
      }
      if (playingState[stem]) {
        stopPlayback(stem);
        startPlayback(stem);
      }
    });
    presetsGrid.appendChild(btn);
  });

  // "More" / "Less" button
  if (presets.length > INITIAL_COUNT) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'fx-preset-btn fx-preset-more-btn';
    if (isExpanded) {
      moreBtn.innerHTML = '<span class="fx-preset-icon">▴</span> Less';
    } else {
      moreBtn.innerHTML = `<span class="fx-preset-icon">▾</span> More (${presets.length - INITIAL_COUNT})`;
    }
    moreBtn.addEventListener('click', () => {
      presetsGrid.dataset.expanded = isExpanded ? 'false' : 'true';
      renderFxPresets(stem);
    });
    presetsGrid.appendChild(moreBtn);
  }
}

function updateFxButtonState(stem) {
  const chain = effectsChains[stem];
  const fxBtn = document.getElementById(`fx-${stem}`);
  if (!fxBtn) return;

  if (chain && chain.hasActiveEffects()) {
    fxBtn.classList.add('has-effects');
    fxBtn.innerHTML = '🎛️ FX ✓';
  } else {
    fxBtn.classList.remove('has-effects');
    fxBtn.innerHTML = '🎛️ FX';
  }
}

function formatParamValue(value, paramDef) {
  const v = parseFloat(value);
  if (paramDef.unit === 'dB') return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
  if (paramDef.unit === ':1') return `${v.toFixed(1)}:1`;
  if (paramDef.unit === 's') return `${v.toFixed(3)}s`;
  if (paramDef.unit === 'Hz') return `${v.toFixed(0)} Hz`;
  if (paramDef.unit === 'st') return `${v > 0 ? '+' : ''}${v} st`;
  if (paramDef.unit === 'x') return `${v.toFixed(1)}x`;
  if (paramDef.unit === 'bits') return `${v} bits`;
  if (paramDef.unit === '') return v.toFixed(2);
  return `${v} ${paramDef.unit}`;
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
        const newText = `${formatTime(time)} / ${totalDuration}`;
        if (timeDisplay.textContent !== newText) {
          timeDisplay.textContent = newText;
        }
      }
    });
  }
  requestAnimationFrame(updateTimeDisplays);
}

// Start UI update loop
requestAnimationFrame(updateTimeDisplays);
