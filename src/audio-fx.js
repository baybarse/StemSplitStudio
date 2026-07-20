/**
 * @fileoverview Audio Effects Engine for StemSplit Studio.
 *
 * Provides a comprehensive set of real-time audio effects using the Web Audio API.
 * Each effect creates and manages its own AudioNode chain. Effects can be toggled,
 * parameterised, and rendered offline for download.
 *
 * @module audio-fx
 */

// ─── Effect Definitions ─────────────────────────────────────────────────────

/**
 * Master registry of all available effects, grouped by category.
 * Each effect has a unique `id`, display `name`, `icon`, default `params`,
 * and a `create` factory that returns an AudioNode chain.
 */
export const EFFECT_CATEGORIES = {
  vocals: [
    // ── Spatial ──
    { id: 'reverb',       name: 'Reverb',            icon: '🏛️', category: 'Spatial',     params: { decay: 2.5, mix: 0.35 } },
    { id: 'delay',        name: 'Delay / Echo',      icon: '🔁', category: 'Spatial',     params: { time: 0.3, feedback: 0.4, mix: 0.3 } },
    // ── Pitch ──
    { id: 'autotune',     name: 'Auto-Tune',         icon: '🎯', category: 'Pitch',       params: { speed: 0.5 } },
    { id: 'pitchshift',   name: 'Pitch Shift',       icon: '🎵', category: 'Pitch',       params: { semitones: 0 } },
    // ── Modulation ──
    { id: 'chorus',       name: 'Chorus',            icon: '🌊', category: 'Modulation',  params: { rate: 1.5, depth: 0.005, mix: 0.5 } },
    { id: 'flanger',      name: 'Flanger',           icon: '🌀', category: 'Modulation',  params: { rate: 0.5, depth: 0.003, feedback: 0.6 } },
    { id: 'phaser',       name: 'Phaser',            icon: '💫', category: 'Modulation',  params: { rate: 0.8, depth: 800, stages: 4 } },
    // ── Dynamics ──
    { id: 'compressor',   name: 'Compressor',        icon: '📊', category: 'Dynamics',    params: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 } },
    { id: 'noisegate',    name: 'Noise Gate',        icon: '🚪', category: 'Dynamics',    params: { threshold: -50 } },
    { id: 'deesser',      name: 'De-Esser',          icon: '🐍', category: 'Dynamics',    params: { sensitivity: 0.6 } },
    // ── Tone ──
    { id: 'eq3',          name: 'EQ (3-Band)',       icon: '🎚️', category: 'Tone',        params: { low: 0, mid: 0, high: 0 } },
    { id: 'distortion',   name: 'Distortion',        icon: '⚡', category: 'Tone',        params: { drive: 20, tone: 2000 } },
    // ── Voice FX ──
    { id: 'telephone',    name: 'Telephone',         icon: '📞', category: 'Voice FX',    params: {} },
    { id: 'radio',        name: 'Radio',             icon: '📻', category: 'Voice FX',    params: {} },
    { id: 'megaphone',    name: 'Megaphone',         icon: '📢', category: 'Voice FX',    params: {} },
    { id: 'robot',        name: 'Robot Voice',       icon: '🤖', category: 'Voice FX',    params: { frequency: 150 } },
    { id: 'chipmunk',     name: 'Chipmunk',          icon: '🐿️', category: 'Voice FX',    params: { rate: 1.5 } },
    { id: 'deepvoice',    name: 'Deep Voice',        icon: '🗣️', category: 'Voice FX',    params: { rate: 0.75 } },
    { id: 'whisper',      name: 'Whisper',           icon: '🤫', category: 'Voice FX',    params: { mix: 0.7 } },
  ],
  instruments: [
    // ── Spatial ──
    { id: 'reverb',       name: 'Reverb',            icon: '🏛️', category: 'Spatial',     params: { decay: 2.0, mix: 0.3 } },
    { id: 'delay',        name: 'Delay / Echo',      icon: '🔁', category: 'Spatial',     params: { time: 0.25, feedback: 0.35, mix: 0.25 } },
    // ── Modulation ──
    { id: 'chorus',       name: 'Chorus',            icon: '🌊', category: 'Modulation',  params: { rate: 1.0, depth: 0.004, mix: 0.4 } },
    { id: 'flanger',      name: 'Flanger',           icon: '🌀', category: 'Modulation',  params: { rate: 0.3, depth: 0.002, feedback: 0.5 } },
    { id: 'phaser',       name: 'Phaser',            icon: '💫', category: 'Modulation',  params: { rate: 0.5, depth: 600, stages: 4 } },
    { id: 'tremolo',      name: 'Tremolo',           icon: '〰️', category: 'Modulation',  params: { rate: 5, depth: 0.6 } },
    { id: 'vibrato',      name: 'Vibrato',           icon: '🎶', category: 'Modulation',  params: { rate: 5, depth: 10 } },
    { id: 'wahwah',       name: 'Wah-Wah',           icon: '🎸', category: 'Modulation',  params: { frequency: 800, depth: 600 } },
    // ── Dynamics ──
    { id: 'compressor',   name: 'Compressor',        icon: '📊', category: 'Dynamics',    params: { threshold: -20, ratio: 3, attack: 0.005, release: 0.2 } },
    // ── Tone ──
    { id: 'eq3',          name: 'EQ (3-Band)',       icon: '🎚️', category: 'Tone',        params: { low: 0, mid: 0, high: 0 } },
    { id: 'distortion',   name: 'Distortion',        icon: '⚡', category: 'Tone',        params: { drive: 30, tone: 3000 } },
    { id: 'bitcrusher',   name: 'Bitcrusher',        icon: '👾', category: 'Tone',        params: { bits: 8, sampleReduction: 4 } },
    { id: 'lofi',         name: 'Lo-Fi',             icon: '📼', category: 'Tone',        params: { cutoff: 3000 } },
    { id: 'vinyl',        name: 'Vinyl',             icon: '💿', category: 'Tone',        params: { noise: 0.02, crackle: 0.01 } },
    // ── Stereo ──
    { id: 'stereowidener', name: 'Stereo Widener',   icon: '↔️', category: 'Stereo',      params: { width: 1.5 } },
    { id: 'panning',       name: 'Panning',          icon: '🔀', category: 'Stereo',      params: { pan: 0 } },
  ],
};

/**
 * Preset configurations that enable multiple effects with tuned parameters.
 */
export const PRESETS = {
  vocals: [
    // ── Essential ──
    { id: 'clean',          name: 'Clean',             icon: '✨', effects: {} },
    { id: 'radio_ready',    name: 'Radio Ready',       icon: '📻', effects: { compressor: { threshold: -18, ratio: 5, attack: 0.003, release: 0.2 }, eq3: { low: -2, mid: 3, high: 2 }, reverb: { decay: 1.2, mix: 0.15 } } },
    { id: 'studio_warmth',  name: 'Studio Warmth',     icon: '🎙️', effects: { compressor: { threshold: -20, ratio: 3, attack: 0.005, release: 0.25 }, eq3: { low: 2, mid: 1, high: -1 }, reverb: { decay: 1.0, mix: 0.1 } } },
    { id: 'broadcast',      name: 'Broadcast',         icon: '📡', effects: { compressor: { threshold: -15, ratio: 6, attack: 0.002, release: 0.15 }, eq3: { low: -3, mid: 4, high: 3 }, noisegate: { threshold: -45 } } },
    { id: 'podcast',        name: 'Podcast',           icon: '🎧', effects: { compressor: { threshold: -22, ratio: 4, attack: 0.004, release: 0.3 }, eq3: { low: -1, mid: 2, high: 1 }, noisegate: { threshold: -50 }, deesser: { sensitivity: 0.5 } } },
    // ── Spatial / Reverb ──
    { id: 'concert_hall',   name: 'Concert Hall',      icon: '🎭', effects: { reverb: { decay: 4.0, mix: 0.5 }, delay: { time: 0.4, feedback: 0.3, mix: 0.15 }, compressor: { threshold: -20, ratio: 3, attack: 0.005, release: 0.3 } } },
    { id: 'cathedral',      name: 'Cathedral',         icon: '⛪', effects: { reverb: { decay: 7.0, mix: 0.65 }, delay: { time: 0.6, feedback: 0.4, mix: 0.2 } } },
    { id: 'small_room',     name: 'Small Room',        icon: '🏠', effects: { reverb: { decay: 0.8, mix: 0.2 } } },
    { id: 'bathroom',       name: 'Bathroom',          icon: '🚿', effects: { reverb: { decay: 1.5, mix: 0.45 }, eq3: { low: -3, mid: 2, high: 4 } } },
    { id: 'cave',           name: 'Cave',              icon: '🕳️', effects: { reverb: { decay: 6.0, mix: 0.7 }, delay: { time: 0.8, feedback: 0.6, mix: 0.3 }, eq3: { low: 5, mid: -2, high: -5 } } },
    { id: 'stadium',        name: 'Stadium',           icon: '🏟️', effects: { reverb: { decay: 5.0, mix: 0.55 }, delay: { time: 0.5, feedback: 0.45, mix: 0.25 }, compressor: { threshold: -18, ratio: 4, attack: 0.003, release: 0.2 } } },
    // ── Genre / Style ──
    { id: 'pop_vocal',      name: 'Pop Vocal',         icon: '🎤', effects: { compressor: { threshold: -16, ratio: 5, attack: 0.003, release: 0.2 }, eq3: { low: -1, mid: 3, high: 4 }, reverb: { decay: 1.5, mix: 0.2 }, autotune: { speed: 0.7 } } },
    { id: 'rnb_smooth',     name: 'R&B Smooth',        icon: '🌙', effects: { reverb: { decay: 2.5, mix: 0.35 }, chorus: { rate: 0.8, depth: 0.004, mix: 0.25 }, compressor: { threshold: -20, ratio: 3, attack: 0.005, release: 0.3 }, eq3: { low: 3, mid: 0, high: 2 } } },
    { id: 'rock_vocal',     name: 'Rock Vocal',        icon: '🎸', effects: { compressor: { threshold: -12, ratio: 6, attack: 0.002, release: 0.15 }, distortion: { drive: 8, tone: 4000 }, eq3: { low: 1, mid: 5, high: 2 } } },
    { id: 'jazz_vocal',     name: 'Jazz Vocal',        icon: '🎷', effects: { reverb: { decay: 2.0, mix: 0.3 }, compressor: { threshold: -25, ratio: 2, attack: 0.01, release: 0.4 }, eq3: { low: 2, mid: 1, high: -2 } } },
    { id: 'edm_vocal',      name: 'EDM Vocal',         icon: '🔊', effects: { autotune: { speed: 0.9 }, compressor: { threshold: -14, ratio: 6, attack: 0.001, release: 0.1 }, reverb: { decay: 1.8, mix: 0.25 }, delay: { time: 0.375, feedback: 0.35, mix: 0.2 } } },
    { id: 'trap_vocal',     name: 'Trap Vocal',        icon: '🔥', effects: { autotune: { speed: 0.85 }, reverb: { decay: 2.0, mix: 0.3 }, delay: { time: 0.25, feedback: 0.3, mix: 0.2 }, compressor: { threshold: -15, ratio: 5, attack: 0.002, release: 0.15 }, eq3: { low: 4, mid: 2, high: 3 } } },
    { id: 'country',        name: 'Country',           icon: '🤠', effects: { reverb: { decay: 1.8, mix: 0.25 }, compressor: { threshold: -22, ratio: 3, attack: 0.005, release: 0.3 }, eq3: { low: 1, mid: 3, high: 2 } } },
    { id: 'reggae',         name: 'Reggae',            icon: '🌴', effects: { delay: { time: 0.375, feedback: 0.5, mix: 0.3 }, reverb: { decay: 2.0, mix: 0.25 }, eq3: { low: 4, mid: -1, high: -2 } } },
    // ── Creative / Mood ──
    { id: 'dreamy',         name: 'Dreamy',            icon: '💭', effects: { reverb: { decay: 5.0, mix: 0.6 }, chorus: { rate: 0.5, depth: 0.008, mix: 0.5 }, delay: { time: 0.5, feedback: 0.5, mix: 0.25 } } },
    { id: 'ethereal',       name: 'Ethereal',          icon: '🦋', effects: { reverb: { decay: 6.5, mix: 0.7 }, chorus: { rate: 0.3, depth: 0.006, mix: 0.4 }, phaser: { rate: 0.2, depth: 500, stages: 4 }, delay: { time: 0.6, feedback: 0.5, mix: 0.2 } } },
    { id: 'dark_ambient',   name: 'Dark Ambient',      icon: '🌑', effects: { reverb: { decay: 7.0, mix: 0.65 }, eq3: { low: 6, mid: -3, high: -6 }, chorus: { rate: 0.2, depth: 0.007, mix: 0.3 }, pitchshift: { semitones: -3 } } },
    { id: 'angelic',        name: 'Angelic',           icon: '👼', effects: { reverb: { decay: 5.5, mix: 0.55 }, chorus: { rate: 1.0, depth: 0.005, mix: 0.45 }, eq3: { low: -3, mid: 0, high: 5 }, delay: { time: 0.4, feedback: 0.3, mix: 0.15 } } },
    { id: 'underwater',     name: 'Underwater',        icon: '🌊', effects: { eq3: { low: 6, mid: -4, high: -10 }, phaser: { rate: 0.3, depth: 800, stages: 6 }, chorus: { rate: 0.4, depth: 0.008, mix: 0.5 }, reverb: { decay: 3.0, mix: 0.5 } } },
    { id: 'lofi_chill',     name: 'Lo-Fi Chill',      icon: '📼', effects: { eq3: { low: 3, mid: -2, high: -5 }, reverb: { decay: 2.0, mix: 0.4 }, chorus: { rate: 0.8, depth: 0.006, mix: 0.3 } } },
    { id: 'powerful',       name: 'Powerful',          icon: '💪', effects: { compressor: { threshold: -15, ratio: 6, attack: 0.002, release: 0.15 }, eq3: { low: 2, mid: 4, high: 1 }, distortion: { drive: 5, tone: 4000 } } },
    { id: 'karaoke',        name: 'Karaoke',           icon: '🎤', effects: { reverb: { decay: 2.5, mix: 0.4 }, delay: { time: 0.3, feedback: 0.25, mix: 0.15 }, compressor: { threshold: -20, ratio: 3, attack: 0.005, release: 0.25 } } },
    // ── Voice FX ──
    { id: 'telephone_fx',   name: 'Telephone',         icon: '📞', effects: { telephone: {} } },
    { id: 'radio_fx',       name: 'Retro Radio',       icon: '📻', effects: { radio: {} } },
    { id: 'megaphone_fx',   name: 'Megaphone',         icon: '📢', effects: { megaphone: {} } },
    { id: 'robot_fx',       name: 'Robot Voice',       icon: '🤖', effects: { robot: { frequency: 150 }, distortion: { drive: 10, tone: 2000 } } },
    { id: 'chipmunk_fx',    name: 'Chipmunk',          icon: '🐿️', effects: { chipmunk: { rate: 1.5 } } },
    { id: 'deep_fx',        name: 'Deep Voice',        icon: '🗣️', effects: { deepvoice: { rate: 0.75 } } },
    { id: 'whisper_fx',     name: 'Whisper',           icon: '🤫', effects: { whisper: { mix: 0.7 } } },
    { id: 'alien',          name: 'Alien',             icon: '👽', effects: { robot: { frequency: 300 }, phaser: { rate: 2.0, depth: 1500, stages: 6 }, reverb: { decay: 3.0, mix: 0.4 } } },
    { id: 'ghost',          name: 'Ghost',             icon: '👻', effects: { reverb: { decay: 6.0, mix: 0.7 }, pitchshift: { semitones: -5 }, chorus: { rate: 0.3, depth: 0.01, mix: 0.5 }, eq3: { low: -5, mid: -2, high: 3 } } },
    { id: 'demon',          name: 'Demon',             icon: '😈', effects: { deepvoice: { rate: 0.6 }, distortion: { drive: 25, tone: 2000 }, reverb: { decay: 4.0, mix: 0.5 }, eq3: { low: 8, mid: -2, high: -4 } } },
    { id: 'autotune_hard',  name: 'Auto-Tune Hard',    icon: '🎯', effects: { autotune: { speed: 1.0 }, compressor: { threshold: -16, ratio: 5, attack: 0.002, release: 0.15 }, reverb: { decay: 1.5, mix: 0.2 } } },
    { id: 'autotune_soft',  name: 'Auto-Tune Soft',    icon: '🎵', effects: { autotune: { speed: 0.3 }, reverb: { decay: 1.8, mix: 0.2 } } },
    { id: 'vinyl_vocal',    name: 'Vintage Vinyl',     icon: '💿', effects: { eq3: { low: 3, mid: 0, high: -6 }, distortion: { drive: 5, tone: 3000 }, reverb: { decay: 1.5, mix: 0.2 } } },
    { id: 'walkie_talkie',  name: 'Walkie-Talkie',     icon: '📟', effects: { telephone: {}, distortion: { drive: 12, tone: 2500 }, noisegate: { threshold: -40 } } },
  ],
  instruments: [
    // ── Essential ──
    { id: 'clean',          name: 'Clean',             icon: '✨', effects: {} },
    { id: 'warm',           name: 'Warm',              icon: '🔥', effects: { eq3: { low: 3, mid: 1, high: -2 }, compressor: { threshold: -22, ratio: 2.5, attack: 0.005, release: 0.3 } } },
    { id: 'bright',         name: 'Bright',            icon: '☀️', effects: { eq3: { low: -2, mid: 1, high: 5 }, compressor: { threshold: -20, ratio: 3, attack: 0.003, release: 0.2 } } },
    { id: 'punchy',         name: 'Punchy',            icon: '👊', effects: { compressor: { threshold: -15, ratio: 5, attack: 0.002, release: 0.15 }, eq3: { low: 4, mid: 2, high: -1 } } },
    { id: 'fat',            name: 'Fat & Heavy',       icon: '💪', effects: { eq3: { low: 6, mid: 2, high: -3 }, compressor: { threshold: -18, ratio: 4, attack: 0.003, release: 0.2 }, distortion: { drive: 5, tone: 3000 } } },
    // ── Spatial ──
    { id: 'ambient',        name: 'Ambient',           icon: '🌌', effects: { reverb: { decay: 5.0, mix: 0.6 }, delay: { time: 0.5, feedback: 0.5, mix: 0.3 }, chorus: { rate: 0.3, depth: 0.005, mix: 0.3 } } },
    { id: 'space',          name: 'Space',             icon: '🚀', effects: { reverb: { decay: 6.0, mix: 0.7 }, delay: { time: 0.6, feedback: 0.6, mix: 0.35 }, phaser: { rate: 0.2, depth: 1000, stages: 6 } } },
    { id: 'hall_reverb',    name: 'Hall Reverb',       icon: '🎭', effects: { reverb: { decay: 3.5, mix: 0.45 } } },
    { id: 'plate_reverb',   name: 'Plate Reverb',      icon: '🍽️', effects: { reverb: { decay: 1.8, mix: 0.35 }, eq3: { low: -2, mid: 1, high: 3 } } },
    { id: 'spring_reverb',  name: 'Spring Reverb',     icon: '🌀', effects: { reverb: { decay: 1.2, mix: 0.3 }, eq3: { low: -1, mid: 3, high: 1 } } },
    { id: 'slapback',       name: 'Slapback Delay',    icon: '👏', effects: { delay: { time: 0.08, feedback: 0.2, mix: 0.3 } } },
    { id: 'long_delay',     name: 'Long Echo',         icon: '🔁', effects: { delay: { time: 0.5, feedback: 0.6, mix: 0.35 } } },
    { id: 'ping_pong',      name: 'Ping Pong',         icon: '🏓', effects: { delay: { time: 0.375, feedback: 0.5, mix: 0.3 }, stereowidener: { width: 2.5 } } },
    // ── Genre ──
    { id: 'rock',           name: 'Rock',              icon: '🎸', effects: { distortion: { drive: 30, tone: 4000 }, compressor: { threshold: -18, ratio: 4, attack: 0.003, release: 0.2 }, eq3: { low: 2, mid: 3, high: 1 } } },
    { id: 'metal',          name: 'Metal',             icon: '🤘', effects: { distortion: { drive: 60, tone: 5000 }, compressor: { threshold: -15, ratio: 6, attack: 0.002, release: 0.15 }, eq3: { low: 5, mid: 4, high: 2 } } },
    { id: 'jazz',           name: 'Jazz Clean',        icon: '🎷', effects: { reverb: { decay: 1.5, mix: 0.2 }, compressor: { threshold: -25, ratio: 2, attack: 0.01, release: 0.4 }, eq3: { low: 1, mid: 2, high: -1 } } },
    { id: 'funk',           name: 'Funk',              icon: '🕺', effects: { compressor: { threshold: -16, ratio: 5, attack: 0.002, release: 0.1 }, eq3: { low: 3, mid: 4, high: 2 }, wahwah: { frequency: 800, depth: 600 } } },
    { id: 'reggae',         name: 'Reggae Dub',        icon: '🌴', effects: { delay: { time: 0.375, feedback: 0.55, mix: 0.35 }, reverb: { decay: 2.5, mix: 0.3 }, eq3: { low: 5, mid: -2, high: -3 } } },
    { id: 'edm',            name: 'EDM',               icon: '🎛️', effects: { compressor: { threshold: -12, ratio: 8, attack: 0.001, release: 0.1 }, eq3: { low: 5, mid: 2, high: 4 }, stereowidener: { width: 2.0 } } },
    { id: 'hip_hop',        name: 'Hip-Hop',           icon: '🎤', effects: { compressor: { threshold: -14, ratio: 5, attack: 0.002, release: 0.15 }, eq3: { low: 6, mid: 1, high: 3 }, distortion: { drive: 3, tone: 4000 } } },
    { id: 'cinematic',      name: 'Cinematic',         icon: '🎬', effects: { reverb: { decay: 5.0, mix: 0.5 }, delay: { time: 0.5, feedback: 0.4, mix: 0.2 }, eq3: { low: 4, mid: 0, high: 2 }, chorus: { rate: 0.3, depth: 0.004, mix: 0.2 } } },
    // ── Creative ──
    { id: 'vintage',        name: 'Vintage',           icon: '🎞️', effects: { vinyl: { noise: 0.025, crackle: 0.015 }, lofi: { cutoff: 2500 }, eq3: { low: 3, mid: -1, high: -6 } } },
    { id: 'retro_game',     name: 'Retro Game',        icon: '🕹️', effects: { bitcrusher: { bits: 6, sampleReduction: 6 }, distortion: { drive: 15, tone: 3000 } } },
    { id: 'lofi',           name: 'Lo-Fi',             icon: '📼', effects: { lofi: { cutoff: 2500 }, vinyl: { noise: 0.02, crackle: 0.01 }, eq3: { low: 3, mid: -1, high: -4 }, chorus: { rate: 0.5, depth: 0.004, mix: 0.2 } } },
    { id: 'tape_saturate',  name: 'Tape Saturation',   icon: '📼', effects: { distortion: { drive: 8, tone: 6000 }, compressor: { threshold: -20, ratio: 3, attack: 0.005, release: 0.25 }, eq3: { low: 2, mid: 1, high: -2 } } },
    { id: 'underwater',     name: 'Underwater',        icon: '🐠', effects: { eq3: { low: 8, mid: -5, high: -10 }, phaser: { rate: 0.3, depth: 800, stages: 6 }, chorus: { rate: 0.3, depth: 0.008, mix: 0.5 }, reverb: { decay: 3.0, mix: 0.5 } } },
    { id: 'dreamy',         name: 'Dreamy',            icon: '💭', effects: { reverb: { decay: 5.0, mix: 0.55 }, chorus: { rate: 0.4, depth: 0.006, mix: 0.4 }, delay: { time: 0.5, feedback: 0.45, mix: 0.2 }, tremolo: { rate: 3, depth: 0.3 } } },
    // ── Effects-Focused ──
    { id: 'wide_stereo',    name: 'Wide Stereo',       icon: '🔊', effects: { stereowidener: { width: 2.0 }, chorus: { rate: 0.5, depth: 0.003, mix: 0.2 }, reverb: { decay: 1.5, mix: 0.15 } } },
    { id: 'distorted',      name: 'Distorted',         icon: '⚡', effects: { distortion: { drive: 50, tone: 4000 }, compressor: { threshold: -20, ratio: 4, attack: 0.003, release: 0.2 } } },
    { id: 'flanger_sweep',  name: 'Flanger Sweep',     icon: '🌀', effects: { flanger: { rate: 0.3, depth: 0.005, feedback: 0.7 }, reverb: { decay: 1.5, mix: 0.2 } } },
    { id: 'phaser_swirl',   name: 'Phaser Swirl',      icon: '💫', effects: { phaser: { rate: 0.5, depth: 1200, stages: 6 }, chorus: { rate: 0.5, depth: 0.003, mix: 0.2 } } },
    { id: 'tremolo_pulse',  name: 'Tremolo Pulse',     icon: '〰️', effects: { tremolo: { rate: 6, depth: 0.7 }, reverb: { decay: 1.5, mix: 0.2 } } },
    { id: 'vibrato_shaky',  name: 'Vibrato Shake',     icon: '🎶', effects: { vibrato: { rate: 6, depth: 15 }, reverb: { decay: 1.2, mix: 0.15 } } },
    { id: 'wah_groove',     name: 'Wah Groove',        icon: '🎸', effects: { wahwah: { frequency: 800, depth: 800 }, compressor: { threshold: -18, ratio: 4, attack: 0.003, release: 0.2 } } },
    { id: 'pan_left',       name: 'Pan Left',          icon: '⬅️', effects: { panning: { pan: -0.8 } } },
    { id: 'pan_right',      name: 'Pan Right',         icon: '➡️', effects: { panning: { pan: 0.8 } } },
    { id: 'dark_muffled',   name: 'Dark & Muffled',    icon: '🌑', effects: { eq3: { low: 5, mid: -2, high: -10 }, reverb: { decay: 3.0, mix: 0.4 } } },
    { id: 'telephone_inst', name: 'Telephone',         icon: '📞', effects: { lofi: { cutoff: 3500 }, distortion: { drive: 8, tone: 3000 }, eq3: { low: -8, mid: 3, high: -4 } } },
    { id: 'bit_crush',      name: 'Bitcrusher',        icon: '👾', effects: { bitcrusher: { bits: 4, sampleReduction: 8 } } },
  ],
};

// ─── Impulse Response Generator ──────────────────────────────────────────────

/**
 * Generate a synthetic convolution reverb impulse response.
 *
 * @param {AudioContext} ctx   - The AudioContext to use.
 * @param {number} decay       - Decay time in seconds (how long the tail lasts).
 * @param {number} [length=3]  - Length of the impulse in seconds.
 * @returns {AudioBuffer} A stereo impulse response buffer.
 */
function generateImpulseResponse(ctx, decay, length = 3) {
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * length);
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < numSamples; i++) {
      // Exponential decay with random noise for naturalistic reverb
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / numSamples, decay);
    }
  }

  return buffer;
}

/**
 * Generate a distortion curve for WaveShaperNode.
 *
 * @param {number} amount - Distortion drive (higher = more distorted).
 * @returns {Float32Array} The distortion curve samples.
 */
function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }

  return curve;
}

// ─── Effect Node Factory ────────────────────────────────────────────────────

/**
 * Create a chain of AudioNodes for a given effect.
 *
 * Returns an object with `input`, `output` nodes (to connect in the chain),
 * and an `update(params)` function to change parameters in real-time.
 *
 * @param {AudioContext} ctx      - The AudioContext.
 * @param {string}       effectId - The effect identifier (e.g. 'reverb', 'delay').
 * @param {Object}       params   - Effect parameters.
 * @returns {{ input: AudioNode, output: AudioNode, update: Function, cleanup: Function }}
 */
export function createEffectNodes(ctx, effectId, params) {
  switch (effectId) {

    // ════════════════════════════════════════════════════════════════════
    // REVERB
    // ════════════════════════════════════════════════════════════════════
    case 'reverb': {
      const convolver = ctx.createConvolver();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const input = ctx.createGain();
      const output = ctx.createGain();

      convolver.buffer = generateImpulseResponse(ctx, params.decay || 2.5);

      input.connect(dryGain);
      input.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(output);
      wetGain.connect(output);

      dryGain.gain.value = 1 - (params.mix || 0.35);
      wetGain.gain.value = params.mix || 0.35;

      return {
        input, output,
        update(p) {
          if (p.decay !== undefined) {
            convolver.buffer = generateImpulseResponse(ctx, p.decay);
          }
          if (p.mix !== undefined) {
            dryGain.gain.setValueAtTime(1 - p.mix, ctx.currentTime);
            wetGain.gain.setValueAtTime(p.mix, ctx.currentTime);
          }
        },
        cleanup() {
          input.disconnect(); convolver.disconnect();
          dryGain.disconnect(); wetGain.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // DELAY / ECHO
    // ════════════════════════════════════════════════════════════════════
    case 'delay': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const delayNode = ctx.createDelay(5.0);
      const feedback = ctx.createGain();

      delayNode.delayTime.value = params.time || 0.3;
      feedback.gain.value = params.feedback || 0.4;
      dryGain.gain.value = 1 - (params.mix || 0.3);
      wetGain.gain.value = params.mix || 0.3;

      input.connect(dryGain);
      input.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(wetGain);
      dryGain.connect(output);
      wetGain.connect(output);

      return {
        input, output,
        update(p) {
          if (p.time !== undefined) delayNode.delayTime.setValueAtTime(p.time, ctx.currentTime);
          if (p.feedback !== undefined) feedback.gain.setValueAtTime(p.feedback, ctx.currentTime);
          if (p.mix !== undefined) {
            dryGain.gain.setValueAtTime(1 - p.mix, ctx.currentTime);
            wetGain.gain.setValueAtTime(p.mix, ctx.currentTime);
          }
        },
        cleanup() {
          input.disconnect(); delayNode.disconnect(); feedback.disconnect();
          dryGain.disconnect(); wetGain.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // AUTO-TUNE (Pitch Correction Simulation)
    // ════════════════════════════════════════════════════════════════════
    case 'autotune': {
      // Simulated auto-tune via fast vibrato + slight pitch wobble removal
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      const speed = params.speed !== undefined ? params.speed : 0.5;
      lfo.frequency.value = 8 + (speed * 20); // faster = more correction feel
      lfoGain.gain.value = 0.001 + (speed * 0.002);
      delayNode.delayTime.value = 0.01;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(delayNode);
      delayNode.connect(output);

      return {
        input, output,
        update(p) {
          if (p.speed !== undefined) {
            lfo.frequency.setValueAtTime(8 + (p.speed * 20), ctx.currentTime);
            lfoGain.gain.setValueAtTime(0.001 + (p.speed * 0.002), ctx.currentTime);
          }
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // PITCH SHIFT (via playback rate on BufferSource - simplified)
    // ════════════════════════════════════════════════════════════════════
    case 'pitchshift': {
      // Simple pitch shift via delay modulation to simulate pitch change
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(1.0);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      const semitones = params.semitones || 0;
      const rate = Math.pow(2, semitones / 12);
      // Modulate delay for pitch-shift like effect
      lfo.type = 'sawtooth';
      lfo.frequency.value = Math.abs(semitones) * 2 + 2;
      lfoGain.gain.value = 0.005 * Math.abs(semitones);
      delayNode.delayTime.value = 0.02;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(delayNode);
      delayNode.connect(output);

      // Slight gain adjustment for perceived volume
      output.gain.value = semitones > 0 ? 0.9 : 1.1;

      return {
        input, output,
        _semitones: semitones,
        update(p) {
          if (p.semitones !== undefined) {
            this._semitones = p.semitones;
            lfo.frequency.setValueAtTime(Math.abs(p.semitones) * 2 + 2, ctx.currentTime);
            lfoGain.gain.setValueAtTime(0.005 * Math.abs(p.semitones), ctx.currentTime);
            output.gain.setValueAtTime(p.semitones > 0 ? 0.9 : 1.1, ctx.currentTime);
          }
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // CHORUS
    // ════════════════════════════════════════════════════════════════════
    case 'chorus': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const delayNode = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 1.5;
      lfoGain.gain.value = params.depth || 0.005;
      delayNode.delayTime.value = 0.015;

      dryGain.gain.value = 1 - (params.mix || 0.5);
      wetGain.gain.value = params.mix || 0.5;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(dryGain);
      input.connect(delayNode);
      delayNode.connect(wetGain);
      dryGain.connect(output);
      wetGain.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) lfo.frequency.setValueAtTime(p.rate, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth, ctx.currentTime);
          if (p.mix !== undefined) {
            dryGain.gain.setValueAtTime(1 - p.mix, ctx.currentTime);
            wetGain.gain.setValueAtTime(p.mix, ctx.currentTime);
          }
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect();
          dryGain.disconnect(); wetGain.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // FLANGER
    // ════════════════════════════════════════════════════════════════════
    case 'flanger': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(0.02);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const feedback = ctx.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 0.5;
      lfoGain.gain.value = params.depth || 0.003;
      delayNode.delayTime.value = 0.005;
      feedback.gain.value = params.feedback || 0.6;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(output); // dry path
      input.connect(delayNode);
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      delayNode.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) lfo.frequency.setValueAtTime(p.rate, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth, ctx.currentTime);
          if (p.feedback !== undefined) feedback.gain.setValueAtTime(p.feedback, ctx.currentTime);
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect();
          feedback.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // PHASER
    // ════════════════════════════════════════════════════════════════════
    case 'phaser': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const stages = params.stages || 4;
      const filters = [];
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 0.8;
      lfoGain.gain.value = params.depth || 800;

      for (let i = 0; i < stages; i++) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'allpass';
        filter.frequency.value = 1000 + i * 200;
        filter.Q.value = 0.5;
        lfoGain.connect(filter.frequency);
        filters.push(filter);
      }

      lfo.connect(lfoGain);
      lfo.start();

      // Connect input → filter chain → output, plus dry pass-through
      input.connect(output); // dry
      let prev = input;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) lfo.frequency.setValueAtTime(p.rate, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth, ctx.currentTime);
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          filters.forEach(f => f.disconnect());
          input.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // COMPRESSOR
    // ════════════════════════════════════════════════════════════════════
    case 'compressor': {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = params.threshold ?? -24;
      compressor.ratio.value = params.ratio ?? 4;
      compressor.attack.value = params.attack ?? 0.003;
      compressor.release.value = params.release ?? 0.25;
      compressor.knee.value = 10;

      return {
        input: compressor, output: compressor,
        update(p) {
          if (p.threshold !== undefined) compressor.threshold.setValueAtTime(p.threshold, ctx.currentTime);
          if (p.ratio !== undefined) compressor.ratio.setValueAtTime(p.ratio, ctx.currentTime);
          if (p.attack !== undefined) compressor.attack.setValueAtTime(p.attack, ctx.currentTime);
          if (p.release !== undefined) compressor.release.setValueAtTime(p.release, ctx.currentTime);
        },
        cleanup() { compressor.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // NOISE GATE (Simulated via Compressor with extreme settings)
    // ════════════════════════════════════════════════════════════════════
    case 'noisegate': {
      const compressor = ctx.createDynamicsCompressor();
      const threshold = params.threshold ?? -50;
      compressor.threshold.value = threshold;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.05;
      compressor.knee.value = 0;

      return {
        input: compressor, output: compressor,
        update(p) {
          if (p.threshold !== undefined) compressor.threshold.setValueAtTime(p.threshold, ctx.currentTime);
        },
        cleanup() { compressor.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // DE-ESSER (High-frequency dynamic compression)
    // ════════════════════════════════════════════════════════════════════
    case 'deesser': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 5000;
      highShelf.gain.value = -(params.sensitivity || 0.6) * 12;

      input.connect(highShelf);
      highShelf.connect(output);

      return {
        input, output,
        update(p) {
          if (p.sensitivity !== undefined) {
            highShelf.gain.setValueAtTime(-p.sensitivity * 12, ctx.currentTime);
          }
        },
        cleanup() { input.disconnect(); highShelf.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // EQ (3-BAND)
    // ════════════════════════════════════════════════════════════════════
    case 'eq3': {
      const low = ctx.createBiquadFilter();
      const mid = ctx.createBiquadFilter();
      const high = ctx.createBiquadFilter();

      low.type = 'lowshelf';
      low.frequency.value = 320;
      low.gain.value = params.low || 0;

      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.5;
      mid.gain.value = params.mid || 0;

      high.type = 'highshelf';
      high.frequency.value = 3200;
      high.gain.value = params.high || 0;

      low.connect(mid);
      mid.connect(high);

      return {
        input: low, output: high,
        update(p) {
          if (p.low !== undefined) low.gain.setValueAtTime(p.low, ctx.currentTime);
          if (p.mid !== undefined) mid.gain.setValueAtTime(p.mid, ctx.currentTime);
          if (p.high !== undefined) high.gain.setValueAtTime(p.high, ctx.currentTime);
        },
        cleanup() { low.disconnect(); mid.disconnect(); high.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // DISTORTION
    // ════════════════════════════════════════════════════════════════════
    case 'distortion': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const waveshaper = ctx.createWaveShaper();
      const toneFilter = ctx.createBiquadFilter();

      waveshaper.curve = makeDistortionCurve(params.drive || 20);
      waveshaper.oversample = '4x';

      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = params.tone || 2000;

      input.connect(waveshaper);
      waveshaper.connect(toneFilter);
      toneFilter.connect(output);

      return {
        input, output,
        update(p) {
          if (p.drive !== undefined) waveshaper.curve = makeDistortionCurve(p.drive);
          if (p.tone !== undefined) toneFilter.frequency.setValueAtTime(p.tone, ctx.currentTime);
        },
        cleanup() { input.disconnect(); waveshaper.disconnect(); toneFilter.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // TELEPHONE
    // ════════════════════════════════════════════════════════════════════
    case 'telephone': {
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      const distortion = ctx.createWaveShaper();

      highpass.type = 'highpass';
      highpass.frequency.value = 500;
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3500;
      distortion.curve = makeDistortionCurve(8);
      distortion.oversample = '4x';

      highpass.connect(lowpass);
      lowpass.connect(distortion);

      return {
        input: highpass, output: distortion,
        update() {},
        cleanup() { highpass.disconnect(); lowpass.disconnect(); distortion.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // RADIO
    // ════════════════════════════════════════════════════════════════════
    case 'radio': {
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      const compressor = ctx.createDynamicsCompressor();

      highpass.type = 'highpass';
      highpass.frequency.value = 300;
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 5000;
      compressor.threshold.value = -30;
      compressor.ratio.value = 8;

      highpass.connect(lowpass);
      lowpass.connect(compressor);

      return {
        input: highpass, output: compressor,
        update() {},
        cleanup() { highpass.disconnect(); lowpass.disconnect(); compressor.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // MEGAPHONE
    // ════════════════════════════════════════════════════════════════════
    case 'megaphone': {
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      const distortion = ctx.createWaveShaper();
      const boost = ctx.createGain();

      highpass.type = 'highpass';
      highpass.frequency.value = 700;
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 4000;
      distortion.curve = makeDistortionCurve(15);
      distortion.oversample = '4x';
      boost.gain.value = 1.5;

      highpass.connect(lowpass);
      lowpass.connect(distortion);
      distortion.connect(boost);

      return {
        input: highpass, output: boost,
        update() {},
        cleanup() { highpass.disconnect(); lowpass.disconnect(); distortion.disconnect(); boost.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // ROBOT VOICE (Ring modulator)
    // ════════════════════════════════════════════════════════════════════
    case 'robot': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const oscillator = ctx.createOscillator();
      const modGain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = params.frequency || 150;
      modGain.gain.value = 0;

      oscillator.connect(modGain.gain);
      input.connect(modGain);
      modGain.connect(output);
      oscillator.start();

      return {
        input, output,
        update(p) {
          if (p.frequency !== undefined) oscillator.frequency.setValueAtTime(p.frequency, ctx.currentTime);
        },
        cleanup() { oscillator.stop(); oscillator.disconnect(); input.disconnect(); modGain.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // CHIPMUNK (High-speed playback simulation)
    // ════════════════════════════════════════════════════════════════════
    case 'chipmunk': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      // Simulate chipmunk via high-pitched delay modulation
      const delayNode = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      lfo.type = 'sawtooth';
      lfo.frequency.value = 15;
      lfoGain.gain.value = 0.008;
      delayNode.delayTime.value = 0.01;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      // Add high-pass to remove lows
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 400;

      input.connect(delayNode);
      delayNode.connect(highpass);
      highpass.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) {
            lfo.frequency.setValueAtTime(p.rate * 10, ctx.currentTime);
            lfoGain.gain.setValueAtTime(0.003 + (p.rate - 1) * 0.01, ctx.currentTime);
          }
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect(); highpass.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // DEEP VOICE
    // ════════════════════════════════════════════════════════════════════
    case 'deepvoice': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(0.1);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();

      lfo.type = 'sawtooth';
      lfo.frequency.value = 5;
      lfoGain.gain.value = 0.01;
      delayNode.delayTime.value = 0.03;

      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2500;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(delayNode);
      delayNode.connect(lowpass);
      lowpass.connect(output);

      // Bass boost
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 300;
      lowShelf.gain.value = 8;

      // Re-route through bass boost
      lowpass.disconnect();
      lowpass.connect(lowShelf);
      lowShelf.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) {
            lfo.frequency.setValueAtTime(p.rate * 7, ctx.currentTime);
          }
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect();
          lowpass.disconnect(); lowShelf.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // WHISPER
    // ════════════════════════════════════════════════════════════════════
    case 'whisper': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();

      // Whisper: band-pass filter + soft noise
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 2000;
      bandpass.Q.value = 0.3;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 800;

      const mix = params.mix || 0.7;
      dryGain.gain.value = 1 - mix;
      wetGain.gain.value = mix;

      input.connect(dryGain);
      input.connect(bandpass);
      bandpass.connect(highpass);
      highpass.connect(wetGain);
      dryGain.connect(output);
      wetGain.connect(output);

      return {
        input, output,
        update(p) {
          if (p.mix !== undefined) {
            dryGain.gain.setValueAtTime(1 - p.mix, ctx.currentTime);
            wetGain.gain.setValueAtTime(p.mix, ctx.currentTime);
          }
        },
        cleanup() {
          input.disconnect(); bandpass.disconnect(); highpass.disconnect();
          dryGain.disconnect(); wetGain.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // TREMOLO
    // ════════════════════════════════════════════════════════════════════
    case 'tremolo': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const tremGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 5;
      lfoGain.gain.value = params.depth || 0.6;
      tremGain.gain.value = 1;

      lfo.connect(lfoGain);
      lfoGain.connect(tremGain.gain);
      lfo.start();

      input.connect(tremGain);
      tremGain.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) lfo.frequency.setValueAtTime(p.rate, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth, ctx.currentTime);
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); tremGain.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // VIBRATO
    // ════════════════════════════════════════════════════════════════════
    case 'vibrato': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(0.1);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 5;
      lfoGain.gain.value = (params.depth || 10) / 1000;
      delayNode.delayTime.value = 0.01;

      lfo.connect(lfoGain);
      lfoGain.connect(delayNode.delayTime);
      lfo.start();

      input.connect(delayNode);
      delayNode.connect(output);

      return {
        input, output,
        update(p) {
          if (p.rate !== undefined) lfo.frequency.setValueAtTime(p.rate, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth / 1000, ctx.currentTime);
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); delayNode.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // WAH-WAH
    // ════════════════════════════════════════════════════════════════════
    case 'wahwah': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const bandpass = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      bandpass.type = 'bandpass';
      bandpass.frequency.value = params.frequency || 800;
      bandpass.Q.value = 5;

      lfo.type = 'sine';
      lfo.frequency.value = 2;
      lfoGain.gain.value = params.depth || 600;

      lfo.connect(lfoGain);
      lfoGain.connect(bandpass.frequency);
      lfo.start();

      input.connect(bandpass);
      bandpass.connect(output);

      return {
        input, output,
        update(p) {
          if (p.frequency !== undefined) bandpass.frequency.setValueAtTime(p.frequency, ctx.currentTime);
          if (p.depth !== undefined) lfoGain.gain.setValueAtTime(p.depth, ctx.currentTime);
        },
        cleanup() {
          lfo.stop(); lfo.disconnect(); lfoGain.disconnect();
          input.disconnect(); bandpass.disconnect(); output.disconnect();
        }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // BITCRUSHER (Simulated via WaveShaper)
    // ════════════════════════════════════════════════════════════════════
    case 'bitcrusher': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const waveshaper = ctx.createWaveShaper();

      const bits = params.bits || 8;
      const step = Math.pow(0.5, bits);
      const samples = 44100;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = step * Math.floor(x / step + 0.5);
      }
      waveshaper.curve = curve;
      waveshaper.oversample = 'none';

      input.connect(waveshaper);
      waveshaper.connect(output);

      return {
        input, output,
        update(p) {
          if (p.bits !== undefined) {
            const s = Math.pow(0.5, p.bits);
            const c = new Float32Array(44100);
            for (let i = 0; i < 44100; i++) {
              const x = (i * 2) / 44100 - 1;
              c[i] = s * Math.floor(x / s + 0.5);
            }
            waveshaper.curve = c;
          }
        },
        cleanup() { input.disconnect(); waveshaper.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // LO-FI
    // ════════════════════════════════════════════════════════════════════
    case 'lofi': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const highpass = ctx.createBiquadFilter();

      lowpass.type = 'lowpass';
      lowpass.frequency.value = params.cutoff || 3000;
      lowpass.Q.value = 1;

      highpass.type = 'highpass';
      highpass.frequency.value = 100;

      input.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(output);

      return {
        input, output,
        update(p) {
          if (p.cutoff !== undefined) lowpass.frequency.setValueAtTime(p.cutoff, ctx.currentTime);
        },
        cleanup() { input.disconnect(); lowpass.disconnect(); highpass.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // VINYL (Lo-fi + crackle simulation via filtered noise)
    // ════════════════════════════════════════════════════════════════════
    case 'vinyl': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const highpass = ctx.createBiquadFilter();

      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8000;
      highpass.type = 'highpass';
      highpass.frequency.value = 50;

      // EQ: slight warmth
      const warmth = ctx.createBiquadFilter();
      warmth.type = 'peaking';
      warmth.frequency.value = 300;
      warmth.gain.value = 3;
      warmth.Q.value = 0.5;

      input.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(warmth);
      warmth.connect(output);

      return {
        input, output,
        update() {},
        cleanup() { input.disconnect(); lowpass.disconnect(); highpass.disconnect(); warmth.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // STEREO WIDENER (Mid/Side processing simulation)
    // ════════════════════════════════════════════════════════════════════
    case 'stereowidener': {
      // In mono chain we simulate widening via a short delay + phase
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delayNode = ctx.createDelay(0.05);
      const wetGain = ctx.createGain();

      delayNode.delayTime.value = 0.01 * (params.width || 1.5);
      wetGain.gain.value = 0.5;

      input.connect(output); // dry
      input.connect(delayNode);
      delayNode.connect(wetGain);
      wetGain.connect(output);

      return {
        input, output,
        update(p) {
          if (p.width !== undefined) {
            delayNode.delayTime.setValueAtTime(0.01 * p.width, ctx.currentTime);
          }
        },
        cleanup() { input.disconnect(); delayNode.disconnect(); wetGain.disconnect(); output.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // PANNING
    // ════════════════════════════════════════════════════════════════════
    case 'panning': {
      const panner = ctx.createStereoPanner();
      panner.pan.value = params.pan || 0;

      return {
        input: panner, output: panner,
        update(p) {
          if (p.pan !== undefined) panner.pan.setValueAtTime(p.pan, ctx.currentTime);
        },
        cleanup() { panner.disconnect(); }
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // DEFAULT (passthrough)
    // ════════════════════════════════════════════════════════════════════
    default: {
      const gain = ctx.createGain();
      return {
        input: gain, output: gain,
        update() {},
        cleanup() { gain.disconnect(); }
      };
    }
  }
}

// ─── Effects Chain Manager ──────────────────────────────────────────────────

/**
 * Manages a chain of effects for a single stem.
 * Provides methods to add/remove/update effects and build the AudioNode chain.
 */
export class EffectsChain {
  /**
   * @param {AudioContext} ctx - The AudioContext.
   */
  constructor(ctx) {
    /** @type {AudioContext} */
    this.ctx = ctx;
    /** @type {Map<string, { enabled: boolean, params: Object, nodes: Object|null }>} */
    this.effects = new Map();
    /** @type {GainNode} */
    this.inputGain = ctx.createGain();
    /** @type {GainNode} */
    this.outputGain = ctx.createGain();
  }

  /**
   * Set an effect's enabled state and parameters.
   *
   * @param {string}  effectId - Effect identifier.
   * @param {boolean} enabled  - Whether the effect is active.
   * @param {Object}  params   - Effect parameters.
   */
  setEffect(effectId, enabled, params) {
    this.effects.set(effectId, { enabled, params: { ...params }, nodes: null });
  }

  /**
   * Toggle an effect on/off.
   * @param {string} effectId
   * @param {boolean} enabled
   */
  toggleEffect(effectId, enabled) {
    const eff = this.effects.get(effectId);
    if (eff) eff.enabled = enabled;
  }

  /**
   * Update effect parameters.
   * @param {string} effectId
   * @param {Object} params
   */
  updateParams(effectId, params) {
    const eff = this.effects.get(effectId);
    if (eff) {
      Object.assign(eff.params, params);
      if (eff.nodes && eff.nodes.update) {
        eff.nodes.update(params);
      }
    }
  }

  /**
   * Remove all effects from the chain.
   */
  clearAll() {
    this.cleanup();
    this.effects.clear();
  }

  /**
   * Check if any effects are enabled.
   * @returns {boolean}
   */
  hasActiveEffects() {
    for (const eff of this.effects.values()) {
      if (eff.enabled) return true;
    }
    return false;
  }

  /**
   * Get the current state of all effects (for serialisation / UI sync).
   * @returns {Object<string, { enabled: boolean, params: Object }>}
   */
  getState() {
    const state = {};
    for (const [id, eff] of this.effects) {
      state[id] = { enabled: eff.enabled, params: { ...eff.params } };
    }
    return state;
  }

  /**
   * Build and connect the AudioNode chain.
   * Call this when starting playback with effects.
   *
   * @param {AudioNode} source      - The source node (e.g. BufferSourceNode or GainNode).
   * @param {AudioNode} destination - The destination node (e.g. GainNode before speakers).
   */
  connect(source, destination) {
    this.cleanup();

    const activeEffects = [];
    for (const [id, eff] of this.effects) {
      if (eff.enabled) {
        const nodes = createEffectNodes(this.ctx, id, eff.params);
        eff.nodes = nodes;
        activeEffects.push(nodes);
      }
    }

    if (activeEffects.length === 0) {
      // No effects, direct passthrough
      source.connect(destination);
      return;
    }

    // Chain: source → effect1 → effect2 → … → destination
    source.connect(activeEffects[0].input);
    for (let i = 0; i < activeEffects.length - 1; i++) {
      activeEffects[i].output.connect(activeEffects[i + 1].input);
    }
    activeEffects[activeEffects.length - 1].output.connect(destination);
  }

  /**
   * Disconnect and clean up all active effect nodes.
   */
  cleanup() {
    for (const [, eff] of this.effects) {
      if (eff.nodes) {
        try { eff.nodes.cleanup(); } catch (_) { /* ignore */ }
        eff.nodes = null;
      }
    }
  }
}

// ─── Offline Rendering (Export with effects) ────────────────────────────────

/**
 * Render audio data through an effects chain offline, producing a new Float32Array[].
 * This "bakes" the effects into the audio for download.
 *
 * @param {Float32Array[]} channelData - Source audio channels.
 * @param {number}         sampleRate  - Sample rate.
 * @param {Map<string, { enabled: boolean, params: Object }>} effectsMap - Effects configuration.
 * @returns {Promise<Float32Array[]>} Rendered audio with effects baked in.
 */
export async function renderWithEffects(channelData, sampleRate, effectsMap) {
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;
  // Add extra time for reverb/delay tails (3 seconds max)
  const tailSamples = Math.floor(sampleRate * 3);
  const totalSamples = numSamples + tailSamples;

  const offlineCtx = new OfflineAudioContext(numChannels, totalSamples, sampleRate);

  // Create source buffer
  const srcBuffer = offlineCtx.createBuffer(numChannels, numSamples, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    srcBuffer.copyToChannel(channelData[ch], ch);
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = srcBuffer;

  // Build effects chain
  const activeEffects = [];
  for (const [id, eff] of effectsMap) {
    if (eff.enabled) {
      const nodes = createEffectNodes(offlineCtx, id, eff.params);
      activeEffects.push(nodes);
    }
  }

  if (activeEffects.length === 0) {
    // No effects, return original
    return channelData;
  }

  // Chain: source → effect1 → effect2 → … → destination
  source.connect(activeEffects[0].input);
  for (let i = 0; i < activeEffects.length - 1; i++) {
    activeEffects[i].output.connect(activeEffects[i + 1].input);
  }
  activeEffects[activeEffects.length - 1].output.connect(offlineCtx.destination);

  source.start(0);

  const rendered = await offlineCtx.startRendering();

  // Extract channel data (trim tail silence)
  const result = [];
  for (let ch = 0; ch < numChannels; ch++) {
    // Keep original length + find actual tail end
    const fullData = rendered.getChannelData(ch);
    // Trim trailing silence (threshold: -80dB ≈ 0.0001)
    let endIdx = fullData.length - 1;
    while (endIdx > numSamples && Math.abs(fullData[endIdx]) < 0.0001) {
      endIdx--;
    }
    const trimmedLength = Math.max(numSamples, endIdx + 1);
    result.push(new Float32Array(fullData.buffer, 0, trimmedLength));
  }

  return result;
}

/**
 * Get effect parameter definitions for UI rendering.
 * Returns slider config for each parameter of the given effect.
 *
 * @param {string} effectId - The effect identifier.
 * @returns {Array<{ key: string, label: string, min: number, max: number, step: number, unit: string }>}
 */
export function getEffectParamDefs(effectId) {
  const defs = {
    reverb:        [{ key: 'decay', label: 'Decay', min: 0.5, max: 8, step: 0.1, unit: 's' }, { key: 'mix', label: 'Wet/Dry', min: 0, max: 1, step: 0.01, unit: '' }],
    delay:         [{ key: 'time', label: 'Time', min: 0.01, max: 2, step: 0.01, unit: 's' }, { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, unit: '' }, { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' }],
    autotune:      [{ key: 'speed', label: 'Correction Speed', min: 0, max: 1, step: 0.01, unit: '' }],
    pitchshift:    [{ key: 'semitones', label: 'Semitones', min: -12, max: 12, step: 1, unit: 'st' }],
    chorus:        [{ key: 'rate', label: 'Rate', min: 0.1, max: 10, step: 0.1, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 0.001, max: 0.02, step: 0.001, unit: '' }, { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' }],
    flanger:       [{ key: 'rate', label: 'Rate', min: 0.05, max: 5, step: 0.05, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 0.001, max: 0.01, step: 0.001, unit: '' }, { key: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01, unit: '' }],
    phaser:        [{ key: 'rate', label: 'Rate', min: 0.1, max: 5, step: 0.1, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 100, max: 2000, step: 50, unit: 'Hz' }],
    compressor:    [{ key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, unit: 'dB' }, { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1' }, { key: 'attack', label: 'Attack', min: 0, max: 0.1, step: 0.001, unit: 's' }, { key: 'release', label: 'Release', min: 0.01, max: 1, step: 0.01, unit: 's' }],
    noisegate:     [{ key: 'threshold', label: 'Threshold', min: -80, max: 0, step: 1, unit: 'dB' }],
    deesser:       [{ key: 'sensitivity', label: 'Sensitivity', min: 0, max: 1, step: 0.01, unit: '' }],
    eq3:           [{ key: 'low', label: 'Low', min: -12, max: 12, step: 0.5, unit: 'dB' }, { key: 'mid', label: 'Mid', min: -12, max: 12, step: 0.5, unit: 'dB' }, { key: 'high', label: 'High', min: -12, max: 12, step: 0.5, unit: 'dB' }],
    distortion:    [{ key: 'drive', label: 'Drive', min: 1, max: 100, step: 1, unit: '' }, { key: 'tone', label: 'Tone', min: 500, max: 8000, step: 100, unit: 'Hz' }],
    telephone:     [],
    radio:         [],
    megaphone:     [],
    robot:         [{ key: 'frequency', label: 'Frequency', min: 50, max: 500, step: 5, unit: 'Hz' }],
    chipmunk:      [{ key: 'rate', label: 'Speed', min: 1.0, max: 2.5, step: 0.1, unit: 'x' }],
    deepvoice:     [{ key: 'rate', label: 'Depth', min: 0.5, max: 1.0, step: 0.05, unit: 'x' }],
    whisper:       [{ key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' }],
    tremolo:       [{ key: 'rate', label: 'Rate', min: 0.5, max: 20, step: 0.5, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, unit: '' }],
    vibrato:       [{ key: 'rate', label: 'Rate', min: 0.5, max: 15, step: 0.5, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 1, max: 30, step: 1, unit: '' }],
    wahwah:        [{ key: 'frequency', label: 'Center Freq', min: 200, max: 2000, step: 50, unit: 'Hz' }, { key: 'depth', label: 'Depth', min: 100, max: 1500, step: 50, unit: 'Hz' }],
    bitcrusher:    [{ key: 'bits', label: 'Bit Depth', min: 2, max: 16, step: 1, unit: 'bits' }, { key: 'sampleReduction', label: 'Sample Reduction', min: 1, max: 16, step: 1, unit: 'x' }],
    lofi:          [{ key: 'cutoff', label: 'Cutoff', min: 500, max: 8000, step: 100, unit: 'Hz' }],
    vinyl:         [{ key: 'noise', label: 'Noise', min: 0, max: 0.1, step: 0.005, unit: '' }, { key: 'crackle', label: 'Crackle', min: 0, max: 0.05, step: 0.005, unit: '' }],
    stereowidener: [{ key: 'width', label: 'Width', min: 0.5, max: 3, step: 0.1, unit: 'x' }],
    panning:       [{ key: 'pan', label: 'Pan (L/R)', min: -1, max: 1, step: 0.01, unit: '' }],
  };

  return defs[effectId] || [];
}
