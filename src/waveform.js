/**
 * @fileoverview Canvas-based waveform visualisation for audio stems.
 *
 * Renders a modern bar-style waveform with:
 * - Mirrored vertical bars (centred around the midline)
 * - Played / unplayed brightness distinction
 * - Animated playback position indicator
 *
 * Each {@link WaveformRenderer} owns a single `<canvas>` element.
 *
 * @module waveform
 */

/**
 * Renders a waveform visualisation onto an HTML canvas element.
 *
 * @example
 * ```js
 * const renderer = new WaveformRenderer(canvasEl, '#a855f7');
 * renderer.render(channelData[0]);
 * renderer.setPlaybackPosition(0.5); // halfway through
 * ```
 */
export class WaveformRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
   * @param {string}            [color='#a855f7'] - Primary waveform colour (CSS colour string).
   */
  constructor(canvas, color = '#a855f7') {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');

    /** @type {string} Primary bar colour. */
    this.color = color;

    /** @type {Float32Array|null} Mono audio samples to visualise. */
    this.audioData = null;

    /** @type {number} Normalised playback position in [0, 1]. */
    this.playbackPosition = 0;

    /** @type {boolean} Whether playback animation is running. */
    this.isPlaying = false;

    /** @type {number|null} requestAnimationFrame ID. */
    this.animationId = null;
  }

  /**
   * Set audio data and trigger a redraw.
   *
   * @param {Float32Array} audioData - Mono samples (or first channel).
   */
  render(audioData) {
    this.audioData = audioData;
    this.draw();
  }

  /**
   * Draw the bar-style waveform onto the canvas.
   *
   * The canvas is resized to match its CSS layout dimensions multiplied
   * by `devicePixelRatio` for crisp rendering on HiDPI displays.
   */
  draw() {
    const { canvas, ctx, audioData, color, playbackPosition } = this;

    // ── Resize to match layout size at device resolution ────────────────
    const dpr = window.devicePixelRatio || 1;
    const width = (canvas.width = canvas.offsetWidth * dpr);
    const height = (canvas.height = canvas.offsetHeight * dpr);

    ctx.clearRect(0, 0, width, height);

    if (!audioData || audioData.length === 0) return;

    // ── Bar geometry ────────────────────────────────────────────────────
    const barWidth = Math.max(2, Math.round(3 * dpr));
    const barGap = Math.max(1, Math.round(1 * dpr));
    const barStep = barWidth + barGap;
    const numBars = Math.floor(width / barStep);
    const samplesPerBar = Math.floor(audioData.length / numBars);
    const midY = height / 2;

    // ── Pre-compute RMS values per bar for a smoother look ──────────────
    for (let i = 0; i < numBars; i++) {
      const startSample = i * samplesPerBar;

      // Compute RMS (root-mean-square) amplitude for this bar
      let sumSq = 0;
      for (let j = 0; j < samplesPerBar; j++) {
        const s = audioData[startSample + j] || 0;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / samplesPerBar);

      // Map RMS to bar height (with a minimum so silent bars are still visible)
      const barHeight = Math.max(2 * dpr, rms * height * 0.85);

      const x = i * barStep;
      const isPlayed = x / width <= playbackPosition;

      // ── Style: bright for played section, dim for unplayed ──────────
      ctx.globalAlpha = isPlayed ? 0.92 : 0.28;
      ctx.fillStyle = color;

      // ── Draw mirrored bar (centred on midline) ──────────────────────
      const halfBar = barHeight / 2;
      // Rounded-rect bars for a polished look
      const radius = Math.min(barWidth / 2, 2 * dpr);
      roundRect(ctx, x, midY - halfBar, barWidth, barHeight, radius);
      ctx.fill();
    }

    // ── Playback position indicator ─────────────────────────────────────
    if (playbackPosition > 0 && playbackPosition < 1) {
      const posX = Math.round(playbackPosition * width);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      ctx.shadowBlur = 6 * dpr;

      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, height);
      ctx.stroke();

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Update the playback position and redraw.
   *
   * @param {number} position - Normalised position in [0, 1].
   */
  setPlaybackPosition(position) {
    this.playbackPosition = Math.max(0, Math.min(1, position));
    this.draw();
  }

  /**
   * Start a continuous animation loop that updates the playback indicator.
   *
   * @param {() => number} getCurrentTime - Callback returning the current
   *   playback time in seconds.
   * @param {number} duration - Total duration in seconds.
   */
  startAnimation(getCurrentTime, duration) {
    this.isPlaying = true;

    const animate = () => {
      if (!this.isPlaying) return;

      const t = getCurrentTime();
      this.playbackPosition = Math.max(0, Math.min(1, t / duration));
      this.draw();
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Stop the animation loop.
   */
  stopAnimation() {
    this.isPlaying = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Update the primary waveform colour.
   *
   * @param {string} color - New CSS colour value.
   */
  setColor(color) {
    this.color = color;
    if (this.audioData) this.draw();
  }

  /**
   * Release resources and stop any running animation.
   */
  destroy() {
    this.stopAnimation();
    this.audioData = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Draw a filled rounded rectangle path (does **not** stroke/fill – the caller
 * should call `ctx.fill()` or `ctx.stroke()` afterwards).
 *
 * @private
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r - Corner radius.
 */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
