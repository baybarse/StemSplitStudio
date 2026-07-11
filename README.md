# StemSplit Studio 🎵✨

StemSplit Studio is a **free, powerful, and private in-browser audio suite**. It leverages cutting-edge WebGPU AI technologies to perform advanced music manipulation entirely locally on your device—no servers, no uploads, and no waiting in queues.

## 🌟 Core Features

- **✂️ Stem Splitter**: Isolate vocals, drums, bass, and other instruments from any song with studio-quality precision using Meta's HTDemucs AI model.
- **📝 Lyrics Extractor**: Get accurate, time-synced lyrics from any song in seconds. Powered by Whisper AI, featuring automatic language detection and built-in translation to multiple languages.
- **🎙️ Recording Studio**: Upload a backing track, sing along, and record your own vocals directly in your browser.
- **🎛️ Audio Merger (Mixer)**: Mix multiple audio files together. Adjust individual volumes, align tracks, and export your custom mix as a high-quality WAV file.
- **✨ Full Studio**: The complete experience. Upload a track, split the stems, extract the lyrics, record your vocals over the isolated instrumental, mix it all together, and export your final masterpiece.

## 🚀 Key Advantages

- **100% Client-Side**: All audio processing and AI inference happens directly in your browser using WebGPU. Your audio files never leave your computer, ensuring absolute privacy.
- **Zero Latency & No Queues**: Because it runs on your hardware, you don't have to wait for server queues.
- **Offline Capable**: Once the AI models are cached in your browser (via IndexedDB), the application can function entirely offline.
- **Free Forever**: No subscriptions, no hidden fees, no limits on the number of songs you can process.

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript bundled with [Vite](https://vitejs.dev/).
- **Audio Processing**: Web Audio API (OfflineAudioContext for rendering, BiquadFilters for mixing).
- **AI Inference Engine**: [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) with WebGPU acceleration (fallback to WASM).
- **Models**:
  - **Music Separation**: [HTDemucs](https://github.com/facebookresearch/demucs) (Fine-tuned for WebGPU).
  - **Speech-to-Text**: [Whisper](https://github.com/openai/whisper) (ONNX quantized).

## 💻 Local Setup & Installation

To run this project locally from scratch, ensure you have **Node.js (v18+)** installed.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/seperatorvoiceinstrument.git
   cd seperatorvoiceinstrument
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   *The app will be available at `http://localhost:5173`.*

4. **Build for production:**
   ```bash
   npm run build
   ```
   *The compiled files will be output to the `dist` directory, ready to be deployed to GitHub Pages, Vercel, Netlify, or any static hosting service.*

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/seperatorvoiceinstrument/issues).

## 📄 License

This project is open-source and available under the MIT License.
