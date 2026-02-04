# 🦊 Pixqueeze - Superpixel Scaling

**Pixqueeze** is a premium web-based image scaling application designed for high-quality upscaling of low-resolution images and pixel art. By utilizing advanced superpixel algorithms and intelligent post-processing, Pixqueeze preserves sharp edges and distinct features that traditional scaling methods often blur.

---

## ✨ Features

### 🚀 Advanced Scaling Algorithms
Pixqueeze offers a variety of scaling methods to suit different needs:
- **Nearest Neighbor**: Baseline fast scaling, preserving the blocky look of pixels.
- **Bicubic Interpolation**: Standard smooth scaling for natural images.
- **Superpixel Scaling (Draft)**: A feature-aware scaling method that avoids typical interpolation blur.
- **Superpixel Scaling (Production)**: Our flagship algorithm, further refined for superior edge clarity and feature preservation.
- **Megapixel Scaling**: Experimental high-fidelity scaling that incorporates color palette optimization for incredibly clean results.

### 🛠️ Intelligent Post-Processing
Enhance your results further with integrated processing steps:
- **Bilateral Filter**: Reduces noise and artifacts while maintaining sharp object boundaries.
- **Wavelet Sharpening**: Intelligent sharpening that boosts high-frequency details without overshooting.
- **Palette Snapping**: Automatically optimizes the image's colors by snapping them to a refined palette, perfect for cleaning up scanned or noisy pixel art.

### ⚡ Performance & UX
- **Web Worker Architecture**: Heavy computations are offloaded to background threads using Comlink, ensuring a lag-free UI.
- **Real-time 12.5x - 4x Processing**: Optimized for fast iteration and instant feedback.
- **Multi-Zoom Comparisons**: View results at 1x, 2x, and 3x zoom levels side-by-side in a centralized grid.
- **Automatic Pre-scaling**: Large inputs are intelligently scaled to an optimal 256px processing size.

---

## 📸 Screen Shots & Samples

<div align="center">
  <img width="2335" height="289" alt="image" src="https://github.com/user-attachments/assets/fa08504f-600e-4d84-b5bd-7605ca9bae38" />
</div>

<!-- Placeholder for Comparison Samples -->
<div align="center">
  <img width="2385" height="319" alt="image" src="https://github.com/user-attachments/assets/07d2378f-e1cf-4783-a23d-26e01f5460fb" />
</div>

<!-- Placeholder for Main UI Screenshot -->
<div align="center">
  <img width="2385" height="278" alt="image" src="https://github.com/user-attachments/assets/b3962347-0dc8-4c30-a463-e915b2867b89" />
</div>

<br>

<br>

---

## 🛠️ Technology Stack

Pixqueeze is built with a modern, performance-first tech stack:

- **Core**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Nanostores](https://github.com/nanostores/nanostores) (Atomic, lightweight state)
- **Concurrency**: [Comlink](https://github.com/GoogleChromeLabs/comlink) (Web Workers)
- **Styling**: Vanilla CSS (Premium, custom-crafted aesthetics)
- **Tooling**: [Biome](https://biomejs.dev/) (Linting & Formatting), [Vitest](https://vitest.dev/) (Testing)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Project uses pnpm)
- [pnpm](https://pnpm.io/)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/pixqueeze.git

# Navigate to project
cd pixqueeze

# Install dependencies
pnpm install
```

### Development
```bash
# Start development server
pnpm run dev
```

### Building for Production
```bash
# Generate production bundle
pnpm run build
```

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<div align="center">
  Made with 🧡 by Mendrik
</div>
