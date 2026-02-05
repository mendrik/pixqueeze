# Pixqueeze - Superpixel Scaling

Pixqueeze is a web-based image scaling application designed for high-quality downscaling of low-resolution images and pixel art. It uses advanced algorithms to preserve features and clarity that standard resizing methods often lose.

---

## Features

### Advanced Scaling Algorithms
Pixqueeze offers a variety of scaling methods, from standard techniques to our custom-built algorithms:

- **Nearest Neighbor**: The classic approach. Fast and preserves the raw, blocky look of pixels without any blurring.
- **Bicubic Interpolation**: Standard smooth scaling, useful for natural photographic images where soft transitions are desired.
- **Palette-Aware Area**: A smart scaling method that first analyzes the image's palette. It "votes" on the final color of a pixel based on the most prominent palette colors in the source area. This is excellent for maintaining distinct colors in pixel art without the muddiness of standard interpolation.
- **Edge-Priority Scaler** (formerly Contour): A content-aware scaling method. Instead of blindly averaging pixels, it scans the source area for high-contrast "seeds"—pixels that define edges or details. It then grows a region around these seeds to determine the final pixel color. This ensures that fine lines and significant details are preserved and not washed out by the background.
- **Sharpener**: Our flagship high-fidelity pipeline. It combines the Edge-Priority logic with a multi-stage post-processing pass:
    1.  **Smart Scaling**: Uses edge-priority logic to maintain structure.
    2.  **Bilateral Filtering**: Smooths out noise while strictly preserving edge sharpness.
    3.  **Palette Optimization**: Dynamically reduces the color count by merging similar shades.
    4.  **Snap**: Forces pixels to align with the optimized palette, producing a clean, posterized look perfect for cleaning up noisy scans or sketches.

### Intelligent Post-Processing
Enhance your results further with integrated processing steps:
- **Bilateral Filter**: An edge-preserving smoothing filter that reduces noise without blurring important boundary details.
- **Wavelet Sharpening**: Intelligent sharpening that boosts high-frequency details without overshooting.
- **Palette Optimization**: Automatically optimizes the image's colors by merging similar shades, helping to clean up noisy inputs.

### Performance & User Experience
- **Web Worker Architecture**: All heavy image processing and scaling computations are offloaded to background threads. This ensures the User Interface remains responsive and lag-free, even during intensive operations.
- **Real-time Processing**: Optimized for fast iteration, providing near-instant feedback as you adjust parameters.
- **Multi-Zoom Comparisons**: View processed results at 1x, 2x, and 3x zoom levels side-by-side in a centralized grid for easy evaluation.
- **Adaptive Processing**: The application intelligently scales large inputs to optimal processing sizes.

---

## Screen Shots & Samples

Downscaled to 32 or 64 pixels respectively.

Samples include nearest neighbor, palette area, bicubic, and our custom scalers with various optimizations.

<div align="center">
  <img width="2368" alt="Sample 1" src="https://github.com/user-attachments/assets/6f8833cd-d56c-4dd0-a250-36f51ae20970" />
</div>

<div align="center">
  <img width="2360" alt="Sample 2" src="https://github.com/user-attachments/assets/911e310f-75b8-4151-8502-ad2ab77c7fda" />
</div>

<div align="center">
  <img width="2365" alt="UI Screenshot" src="https://github.com/user-attachments/assets/3ede9a0f-6020-4e8f-83c1-a02a7bb69677" />
</div>

<br>

---

## Technology Stack

Pixqueeze is built with a modern, performance-first tech stack:

- **Core**: React 19 + TypeScript
- **Build Tool**: Vite
- **State Management**: Nanostores (Atomic, lightweight state)
- **Concurrency**: Comlink (Web Workers)
- **Styling**: Vanilla CSS
- **Tooling**: Biome (Linting & Formatting), Vitest (Testing)

---

## Getting Started

### Prerequisites
- Node.js
- pnpm

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

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<div align="center">
  Made by Mendrik
</div>
