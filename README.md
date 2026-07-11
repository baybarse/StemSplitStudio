# 🎵 StemSplit — AI Music Separator

[![Deploy to GitHub Pages](https://github.com/baybarse/seperatorvoiceinstrument/actions/workflows/deploy.yml/badge.svg)](https://github.com/baybarse/seperatorvoiceinstrument/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **AI-powered vocal and instrument separator running entirely in your browser.** No uploads, no servers — your audio never leaves your device.

![StemSplit Screenshot](./screenshot.png)

---

## ✨ Features

- 🧠 **Powered by HTDemucs (Meta AI)** — state-of-the-art music source separation model
- 🔒 **100% Private** — no uploads, everything runs locally in your browser
- 🎤 **Separates Vocals, Drums, Bass, and Other Instruments** into individual stems
- ⚡ **WebGPU Accelerated** — blazing fast processing with WASM fallback for broader compatibility
- 📱 **Responsive Design** — works seamlessly on desktop and mobile
- 💾 **Model Caching** — download the model once, use it forever (cached in your browser)

---

## 🚀 How to Use

1. **Open the app** in your browser
2. **Drop or select** an audio file
3. **Wait** for processing (first run downloads the AI model ~80MB)
4. **Download** your separated stems — vocals, drums, bass, and other instruments

That's it! No account needed, no data sent anywhere.

---

## 🎧 Supported Formats

| Format | Extension |
|--------|-----------|
| MP3    | `.mp3`    |
| WAV    | `.wav`    |
| FLAC   | `.flac`   |
| OGG    | `.ogg`    |
| AAC    | `.aac`    |
| M4A    | `.m4a`    |

---

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| [Vite](https://vitejs.dev/) | Build tool & dev server |
| [ONNX Runtime Web](https://onnxruntime.ai/) | In-browser AI model inference |
| [HTDemucs](https://github.com/facebookresearch/demucs) | Music source separation model (Meta AI) |
| [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | Audio decoding & processing |
| [WebGPU](https://www.w3.org/TR/webgpu/) | GPU-accelerated computation |

---

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/AliAlmasi/seperatorvoiceinstrument.git
cd seperatorvoiceinstrument

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

The production build will be output to the `dist/` directory.

---

## 🌐 Deployment

This project is **automatically deployed** to GitHub Pages via GitHub Actions on every push to the `main` branch.

To set up deployment for your fork:

1. Go to your repository **Settings** → **Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` — the workflow will handle the rest

---

## 🙏 Credits

- **[Meta AI](https://ai.meta.com/)** — for the [Demucs](https://github.com/facebookresearch/demucs) music source separation model
- **[ONNX Runtime](https://onnxruntime.ai/)** team — for making AI inference possible in the browser
- **[Vite](https://vitejs.dev/)** — for the lightning-fast build tooling

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for musicians and audio enthusiasts
</p>
