<div align="center">
  <img src="https://raw.githubusercontent.com/baybarse/StemSplitStudio/main/public/favicon.ico" alt="Logo" width="80" height="80" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🎵</text></svg>'">
  <h1>StemSplit Studio</h1>
  
  <p><strong>The Ultimate In-Browser AI Audio Production Suite</strong></p>

  <p>
    <a href="https://baybarse.github.io/StemSplitStudio/"><strong>🚀 Live Demo</strong></a> · 
    <a href="https://www.linkedin.com/in/baybarshan-ekiz/"><strong>👔 Developer LinkedIn</strong></a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Made_with-WebGPU-blue?style=for-the-badge&logo=webgl" alt="WebGPU" />
    <img src="https://img.shields.io/badge/Framework-Vanilla_JS-yellow?style=for-the-badge&logo=javascript" alt="Vanilla JS" />
    <img src="https://img.shields.io/badge/Bundler-Vite-646CFF?style=for-the-badge&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
  </p>
</div>

<hr />

## 📖 Description

**StemSplit Studio** is a completely free, 100% client-side, and highly advanced audio production suite built for the browser. Leveraging the power of WebGPU and WebAssembly, this tool runs heavyweight AI models directly on your hardware without ever uploading your files to a server. 

Whether you need to extract vocals from a song, transcribe multilingual lyrics, record your own voice over isolated instrumentals, or merge multiple audio files into a seamless mix—StemSplit Studio handles it all instantly and privately.

## ✨ Core Features

1. **🔒 Zero Server Processing (Complete Privacy)**
   - Your audio files never leave your device. All AI inference is executed locally using your computer's GPU or CPU.
2. **🎙️ AI Stem Splitting (Powered by HTDemucs)**
   - Isolate any song into 4 distinct, studio-quality tracks: **Vocals**, **Drums**, **Bass**, and **Other**.
3. **📝 Multilingual AI Lyrics Extraction (Powered by Whisper)**
   - Automatically transcribe the vocal track into timestamped lyrics (`.txt`) supporting dozens of languages.
4. **🎛️ Live Browser DAW & Mixer**
   - Adjust individual stem volumes, mute/solo tracks, and view synchronized dynamic waveforms in real time.
5. **🎤 Live Studio Recording**
   - Sing directly over your separated backing tracks using your microphone, perfectly synchronized down to the millisecond.
6. **✂️ Regional Audio Editing & Trimming**
   - Visually define start and end segments to instantly **Mute** or **Isolate** regions of a specific stem.
7. **⏱️ Precision Export Trimming**
   - Set custom time boundaries to export only the specific section of the mix you want.
8. **🔄 Track Merger**
   - Seamlessly drag, drop, reorder, and stitch multiple audio files together without re-encoding latency.
9. **💾 Advanced Local Caching**
   - Gigabytes of ONNX AI models are downloaded once to IndexedDB. Subsequent visits instantly load the models from your hard drive, allowing complete offline usage.
10. **⚡ WebGPU Accelerated**
    - Experience blazing fast inference times by utilizing your system's graphics card, with an automatic WASM fallback for older devices.
11. **⬇️ Dynamic Mixdown Export**
    - Export individual stems, download everything as a ZIP, or generate a custom `.wav` mix utilizing your current volume/mute settings and recorded overdubs.
12. **🎨 Premium Dark UI**
    - A stunning, glassmorphism-inspired dark mode interface with micro-animations and responsive design.

---

## 🛠️ Architecture & Technologies

- **Frontend:** Vanilla HTML, CSS, JavaScript (Mobile-first, Responsive)
- **Audio Engine:** Web Audio API (OfflineAudioContext for high-fidelity rendering, native PCM decoding/encoding)
- **Machine Learning:** ONNX Runtime Web (`onnxruntime-web`)
- **Separation Model:** Meta's HTDemucs (Optimized for WebGPU)
- **Transcription Model:** OpenAI's Whisper (Tiny/Base quantized models)
- **Storage:** IndexedDB (Caching AI Models)
- **Bundler:** Vite 

---

## 🚀 Installation & Setup

If you want to run or modify the project locally, the setup is incredibly straightforward.

### 1. Prerequisites
- [Node.js](https://nodejs.org/en/) (v16.0.0 or higher)
- A modern web browser with WebGPU support (Chrome 113+, Edge 113+, etc.)

### 2. Clone the Repository
```bash
git clone https://github.com/baybarse/StemSplitStudio.git
cd StemSplitStudio
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start the Development Server
```bash
npm run dev
```
Open the provided local URL (usually `http://localhost:5173`) in your browser.

### 5. Build for Production
To create a minified production build:
```bash
npm run build
```
The optimized files will be generated in the `dist/` directory, ready to be deployed to GitHub Pages, Vercel, Netlify, or any static hosting service.

---

## 👨‍💻 Author

**Baybarshan Ekiz**
- LinkedIn: [linkedin.com/in/baybarshan-ekiz](https://www.linkedin.com/in/baybarshan-ekiz/)
- GitHub: [@baybarse](https://github.com/baybarse)

---

## ⚖️ License & Acknowledgments

This project is licensed under the MIT License.

**Acknowledgments:**
- [Meta AI](https://ai.meta.com/) for the original HTDemucs model.
- [OpenAI](https://openai.com/) for the Whisper transcription model.
- [Hugging Face](https://huggingface.co/) and the open-source community for model weights and WebGPU quantization workflows.
