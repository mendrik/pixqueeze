# Pixqueeze - Superpixel Scaling

**Pixqueeze** is a web-based image scaling application designed for high-quality downscaling of low-resolution images and pixel art.

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

<p>Downscaled to 32 or 64 pixels respectively</p>

Samples are nearest neighbour, palette area, bicubic, superpixel variant, superpixel with wavelet sharpening and palette reduction.

<div align="center">
  <img width="2368" height="330" alt="image" src="https://github.com/user-attachments/assets/6f8833cd-d56c-4dd0-a250-36f51ae20970" />
</div>

<!-- Placeholder for Comparison Samples -->
<div align="center">
  <img width="2360" height="312" alt="image" src="https://github.com/user-attachments/assets/911e310f-75b8-4151-8502-ad2ab77c7fda" />
</div>

<!-- Placeholder for Main UI Screenshot -->
<div align="center">
  <img width="2365" height="385" alt="image" src="https://github.com/user-attachments/assets/3ede9a0f-6020-4e8f-83c1-a02a7bb69677" />
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
- **Styling**: Vanilla CSS
- **Tooling**: [Biome](https://biomejs.dev/) (Linting & Formatting), [Vitest](https://vitest.dev/) (Testing)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/)
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
