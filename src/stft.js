/**
 * @fileoverview FFT, STFT, and iSTFT implementations for audio processing.
 *
 * Provides the spectral analysis and synthesis routines required by the
 * HTDemucs ONNX model. All transforms operate on Float32Arrays for
 * compatibility with Web Audio and ONNX Runtime tensors.
 *
 * @module stft
 */

/**
 * Cooley-Tukey radix-2 Decimation-In-Time (DIT) in-place FFT.
 *
 * Transforms the input arrays in-place from the time domain to the
 * frequency domain. The length of both arrays **must** be a power of 2.
 *
 * @param {Float32Array} re - Real part of the signal (modified in-place).
 * @param {Float32Array} im - Imaginary part of the signal (modified in-place).
 * @throws {Error} If the array length is not a power of 2.
 */
export function fft(re, im) {
  const N = re.length;

  if (N <= 1) return;
  if ((N & (N - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, got ${N}`);
  }

  // ── Bit-reversal permutation ──────────────────────────────────────────
  const halfN = N >>> 1;
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      // Swap re[i] <-> re[j]
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      // Swap im[i] <-> im[j]
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
    let k = halfN;
    while (k <= j) {
      j -= k;
      k >>>= 1;
    }
    j += k;
  }

  // ── Butterfly stages ──────────────────────────────────────────────────
  for (let size = 2; size <= N; size <<= 1) {
    const halfSize = size >>> 1;
    const angleStep = -2 * Math.PI / size; // negative for forward FFT

    // Twiddle factor seed
    const wRe = Math.cos(angleStep);
    const wIm = Math.sin(angleStep);

    for (let start = 0; start < N; start += size) {
      let curRe = 1;
      let curIm = 0;

      for (let k = 0; k < halfSize; k++) {
        const evenIdx = start + k;
        const oddIdx = start + k + halfSize;

        // Butterfly: multiply odd element by twiddle factor
        const tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
        const tIm = curRe * im[oddIdx] + curIm * re[oddIdx];

        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;

        // Advance twiddle factor
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

/**
 * Inverse FFT via conjugation.
 *
 * Computes the inverse DFT in-place by conjugating the input, applying
 * the forward FFT, conjugating the output, and dividing by N.
 *
 * @param {Float32Array} re - Real part (modified in-place).
 * @param {Float32Array} im - Imaginary part (modified in-place).
 */
export function ifft(re, im) {
  const N = re.length;

  // Conjugate input
  for (let i = 0; i < N; i++) {
    im[i] = -im[i];
  }

  // Forward FFT
  fft(re, im);

  // Conjugate output and scale by 1/N
  const invN = 1 / N;
  for (let i = 0; i < N; i++) {
    re[i] *= invN;
    im[i] = -im[i] * invN;
  }
}

/**
 * Generate a periodic Hanning (Hann) window.
 *
 * Uses the periodic form: w[n] = 0.5 * (1 - cos(2π n / N))
 * which is preferred for spectral analysis because it satisfies COLA
 * (Constant Overlap-Add) constraints.
 *
 * @param {number} length - Window length in samples.
 * @returns {Float32Array} The Hanning window coefficients.
 */
export function hannWindow(length) {
  const window = new Float32Array(length);
  const twoPiOverN = (2 * Math.PI) / length;
  for (let i = 0; i < length; i++) {
    window[i] = 0.5 * (1 - Math.cos(twoPiOverN * i));
  }
  return window;
}

/**
 * Short-Time Fourier Transform.
 *
 * The signal is center-padded with nFft/2 zeros on each side before
 * analysis. Each frame is windowed with a Hanning window before FFT.
 * Only the positive-frequency bins (nFft/2 + 1) are returned.
 *
 * @param {Float32Array} signal    - Input time-domain signal.
 * @param {number}       [nFft=4096]     - FFT size (must be power of 2).
 * @param {number}       [hopLength=1024] - Hop size in samples.
 * @returns {{ real: Float32Array, imag: Float32Array, nBins: number, nFrames: number }}
 *   Frequency-domain representation. Data is stored in row-major order:
 *   index = frame * nBins + bin.
 */
export function stft(signal, nFft = 4096, hopLength = 1024) {
  const halfFft = nFft >>> 1;
  const nBins = halfFft + 1; // positive frequencies only

  // ── Center-pad the signal ─────────────────────────────────────────────
  const paddedLength = signal.length + nFft; // nFft/2 on each side
  const padded = new Float32Array(paddedLength);
  padded.set(signal, halfFft);

  // ── Compute number of frames ──────────────────────────────────────────
  const nFrames = Math.floor((paddedLength - nFft) / hopLength) + 1;

  // ── Allocate output arrays (frame-major: [frame][bin]) ────────────────
  const real = new Float32Array(nFrames * nBins);
  const imag = new Float32Array(nFrames * nBins);

  // ── Pre-compute window ────────────────────────────────────────────────
  const window = hannWindow(nFft);

  // ── Temporary buffers for each frame's FFT ────────────────────────────
  const frameRe = new Float32Array(nFft);
  const frameIm = new Float32Array(nFft);

  for (let t = 0; t < nFrames; t++) {
    const offset = t * hopLength;

    // Extract windowed frame
    for (let i = 0; i < nFft; i++) {
      frameRe[i] = padded[offset + i] * window[i];
      frameIm[i] = 0;
    }

    // In-place FFT
    fft(frameRe, frameIm);

    // Store positive frequencies only
    const baseIdx = t * nBins;
    for (let f = 0; f < nBins; f++) {
      real[baseIdx + f] = frameRe[f];
      imag[baseIdx + f] = frameIm[f];
    }
  }

  return { real, imag, nBins, nFrames };
}

/**
 * Inverse Short-Time Fourier Transform (overlap-add synthesis).
 *
 * Reconstructs a time-domain signal from its STFT representation.
 * The full spectrum is reconstructed via conjugate symmetry before
 * applying the inverse FFT. Frames are overlap-added with Hanning
 * window weighting and normalised by the sum of squared windows.
 *
 * @param {Float32Array} real      - Real part of STFT (frame-major).
 * @param {Float32Array} imag      - Imaginary part of STFT (frame-major).
 * @param {number}       nBins     - Number of frequency bins per frame.
 * @param {number}       nFrames   - Number of time frames.
 * @param {number}       [nFft=4096]     - FFT size.
 * @param {number}       [hopLength=1024] - Hop size.
 * @param {number}       [length]  - Desired output length. If omitted, the
 *                                    full overlap-add result is returned.
 * @returns {Float32Array} Reconstructed time-domain signal.
 */
export function istft(real, imag, nBins, nFrames, nFft = 4096, hopLength = 1024, length) {
  const halfFft = nFft >>> 1;

  // ── Compute output length ─────────────────────────────────────────────
  const outputLength = length || (nFrames - 1) * hopLength + nFft;

  const output = new Float32Array(outputLength);
  const windowSum = new Float32Array(outputLength);

  // ── Pre-compute window ────────────────────────────────────────────────
  const window = hannWindow(nFft);

  // ── Temporary buffers ─────────────────────────────────────────────────
  const frameRe = new Float32Array(nFft);
  const frameIm = new Float32Array(nFft);

  for (let t = 0; t < nFrames; t++) {
    const baseIdx = t * nBins;

    // ── Reconstruct full spectrum via conjugate symmetry ───────────────
    // Positive frequencies
    for (let f = 0; f < nBins; f++) {
      frameRe[f] = real[baseIdx + f];
      frameIm[f] = imag[baseIdx + f];
    }

    // Negative frequencies (conjugate mirror of positive, excluding DC & Nyquist)
    for (let f = 1; f < halfFft; f++) {
      frameRe[nFft - f] = real[baseIdx + f];
      frameIm[nFft - f] = -imag[baseIdx + f];
    }

    // ── Inverse FFT ───────────────────────────────────────────────────
    ifft(frameRe, frameIm);

    // ── Overlap-add with synthesis window ─────────────────────────────
    const offset = t * hopLength;
    for (let i = 0; i < nFft; i++) {
      const outIdx = offset + i;
      if (outIdx < outputLength) {
        output[outIdx] += frameRe[i] * window[i];
        windowSum[outIdx] += window[i] * window[i];
      }
    }
  }

  // ── Normalise by squared window sum ───────────────────────────────────
  const EPSILON = 1e-8;
  for (let i = 0; i < outputLength; i++) {
    if (windowSum[i] > EPSILON) {
      output[i] /= windowSum[i];
    }
  }

  return output;
}
