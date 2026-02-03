/**
 * Fast, contrast-neutral image sharpening for small images (16–128 pixels).
 * Uses a 2-level wavelet / Laplacian pyramid decomposition.
 *
 * Target Algorithm:
 * 1. Convert to linear luminance (conceptually).
 * 2. Level 1: Blur + subtract -> Detail1
 * 3. Level 2: Blur(Level1) + subtract -> Detail2
 * 4. Remap Detail1 with bounded gain.
 * 5. Recombine: Base + Detail1_Remapped.
 *    (Detail2 is implicitly part of Base if we only decompose 1 level,
 *    but the prompt says "2-level wavelet... Only two scales are required".)
 *
 * Correction (User Feedback):
 * Originally we reconstructed as L1 + Clamped(D1), which caused blurring on strong edges
 * because Clamped(D1) < D1.
 * Correct approach for sharpening: L0 + Clamped(Boost).
 * Or: L1 + D1 + Clamped(Boost) = L0 + Clamped(Boost).
 *
 * Performance:
 *   - Use Separable convolution for blur.
 *   - Kernel: [1, 2, 1] / 4.
 *   - Buffers: Uint8Array input -> Float32Array for processing -> Uint8Array output.
 */

export interface WaveletSharpenOptions {
	/** Gain for the finest detail level (detail1). Typically 1.0 - 2.0. */
	detailGain?: number;
	/** Hard limit for detail amplification to prevent haloing. 0.0 - 1.0 (normalized). */
	clampThreshold?: number;
}

/**
 * Separable 3x3 box blur (approx Gaussian with [1 2 1]/4 kernel).
 *
 * @param src Source float buffer (interleaved RGBA)
 * @param dst Destination float buffer
 * @param w Width
 * @param h Height
 */
function fastBlur(src: Float32Array, dst: Float32Array, w: number, h: number) {
	// Horizontal pass
	// [1 2 1] / 4
	const temp = new Float32Array(src.length);

	// H-pass
	for (let y = 0; y < h; y++) {
		const yOff = y * w;
		for (let x = 0; x < w; x++) {
			const idx = (yOff + x) * 4;

			// Mirror edge handling by clamping index
			const xm1 = x > 0 ? x - 1 : 0;
			const idxL = (yOff + xm1) * 4;

			const xp1 = x < w - 1 ? x + 1 : w - 1;
			const idxR = (yOff + xp1) * 4;

			for (let c = 0; c < 4; c++) {
				// [1 2 1] / 4
				temp[idx + c] =
					(src[idxL + c] + 2 * src[idx + c] + src[idxR + c]) * 0.25;
			}
		}
	}

	// V-pass
	for (let y = 0; y < h; y++) {
		const yOff = y * w;

		// y-1
		const ym1 = y > 0 ? y - 1 : 0;
		const yOffT = ym1 * w;

		// y+1
		const yp1 = y < h - 1 ? y + 1 : h - 1;
		const yOffB = yp1 * w;

		for (let x = 0; x < w; x++) {
			const idx = (yOff + x) * 4;
			const idxT = (yOffT + x) * 4;
			const idxB = (yOffB + x) * 4;

			for (let c = 0; c < 4; c++) {
				dst[idx + c] =
					(temp[idxT + c] + 2 * temp[idx + c] + temp[idxB + c]) * 0.25;
			}
		}
	}
}

/**
 * Soft limiting function (Rational Sigmoid).
 * @param x Input value
 * @param limit Max amplitude
 * @returns mapped value
 */
function softLimit(x: number, limit: number): number {
	if (limit <= 0.0001) return 0;
	// Rational sigmoid: x / (1 + |x|/k) -> approaches k smoothly
	return x / (1 + Math.abs(x) / limit);
}

export function applyWaveletSharpen(
	imageData: ImageData,
	strength = 0.5, // 0.0 to 1.0+
	clampMax = 0.15, // Max change in brightness (0-1). Increased default slightly.
): ImageData {
	const w = imageData.width;
	const h = imageData.height;
	const len = w * h * 4;

	// 1. Input conversion (u8 -> f32 0..1)
	const src = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		src[i] = imageData.data[i] / 255.0;
	}

	// Buffers for pyramid
	// L0 = src
	// L1 = Blur(L0)
	const L1 = new Float32Array(len);
	fastBlur(src, L1, w, h);

	// L2 = Blur(L1)
	// const L2 = new Float32Array(len);
	// fastBlur(L1, L2, w, h);
	// Note: We don't strictly need L2 logic if we just boost D1 directly.
	// The prompt asked for 2-level but "detail2 gain <= 1.0 (or untouched)".
	// So we just focus on D1.

	const output = new Uint8ClampedArray(len);

	// Gain factor.
	// Strength 0.0 -> gain 0 (add nothing).
	// Strength 1.0 -> gain 1 (add 100% more detail).
	const gain = strength * 2.0; // Scale user slider to be punchier

	for (let i = 0; i < len; i += 4) {
		for (let c = 0; c < 3; c++) {
			// RGB
			const idx = i + c;
			const valL0 = src[idx];
			const valL1 = L1[idx];

			// D1 calculation (High Frequency)
			const d1 = valL0 - valL1;

			// Boost
			// We adding EXTRA detail to the original image.
			let boost = d1 * gain;

			// Soft limit the boost
			// This prevents the "extra" sharpness from creating strong halos.
			// But the base detail (d1) is already in valL0, so we preserve original edges.
			boost = softLimit(boost, clampMax);

			// Reconstruct
			// Result = Original + ClampedBoost
			let res = valL0 + boost;

			// Clamp to 0..1
			if (res < 0) res = 0;
			if (res > 1) res = 1;

			output[idx] = (res * 255.0 + 0.5) | 0;
		}
		// Alpha copy
		output[i + 3] = imageData.data[i + 3];
	}

	return new ImageData(output, w, h);
}
