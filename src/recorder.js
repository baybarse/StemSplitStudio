/**
 * @fileoverview Microphone recording module using MediaRecorder API.
 * Records audio, provides real-time visualization, and returns
 * PCM data compatible with the stem separation pipeline.
 * @module recorder
 */

/** @const {number} Target sample rate for recording */
const TARGET_SAMPLE_RATE = 44100;

/**
 * @typedef {Object} RecordingResult
 * @property {Float32Array[]} channelData - Stereo PCM data [L, R]
 * @property {number} sampleRate
 * @property {number} duration - Duration in seconds
 * @property {Blob} blob - Original recorded audio blob
 */

/**
 * Manages microphone recording with real-time audio visualization.
 */
export class AudioRecorder {
  constructor() {
    /** @type {MediaRecorder|null} */
    this.mediaRecorder = null;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    /** @type {AudioContext|null} */
    this.audioCtx = null;
    /** @type {Blob[]} */
    this.chunks = [];
    /** @type {boolean} */
    this.isRecording = false;
    /** @type {number} */
    this.startTime = 0;
    /** @type {number} */
    this.animationId = null;
  }

  /**
   * Start recording from the microphone.
   * @param {HTMLCanvasElement} [canvas] - Optional canvas for visualization
   * @returns {Promise<void>}
   */
  async start(canvas) {
    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: TARGET_SAMPLE_RATE,
      }
    });

    // Set up audio context and analyser for visualization
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // Set up MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(250); // Collect data every 250ms
    this.isRecording = true;
    this.startTime = Date.now();

    // Start visualization if canvas provided
    if (canvas) {
      this._visualize(canvas);
    }
  }

  /**
   * Stop recording and return the result.
   * @returns {Promise<RecordingResult>}
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('Not recording'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          this.isRecording = false;
          this._stopVisualization();

          // Create blob from chunks
          const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
          const duration = (Date.now() - this.startTime) / 1000;

          // Decode to PCM
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          // Extract channel data (make stereo)
          let channelData;
          if (audioBuffer.numberOfChannels >= 2) {
            channelData = [
              new Float32Array(audioBuffer.getChannelData(0)),
              new Float32Array(audioBuffer.getChannelData(1)),
            ];
          } else {
            const mono = new Float32Array(audioBuffer.getChannelData(0));
            channelData = [mono, new Float32Array(mono)];
          }

          audioCtx.close();

          // Clean up stream
          this.stream.getTracks().forEach(t => t.stop());
          this.stream = null;

          resolve({
            channelData,
            sampleRate: audioBuffer.sampleRate,
            duration,
            blob,
          });
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Get elapsed recording time in seconds.
   * @returns {number}
   */
  getElapsedTime() {
    if (!this.isRecording) return 0;
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Cancel recording without saving.
   */
  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.isRecording = false;
    this._stopVisualization();
    this.chunks = [];
  }

  /**
   * Draw real-time audio visualization on canvas.
   * @private
   * @param {HTMLCanvasElement} canvas
   */
  _visualize(canvas) {
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording) return;
      this.animationId = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);

      const width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      const height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Gradient from red to orange
        const hue = 0 + (i / bufferLength) * 30;
        ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.8)`;

        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };
    draw();
  }

  /** @private */
  _stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}
