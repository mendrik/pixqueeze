/**
 * Fast, contrast-neutral image sharpening for small images (16–128 pixels).
 * Uses a 2-level wavelet / Laplacian pyramid decomposition.
 */

export interface WaveletSharpenOptions {
	/** Gain for the finest detail level (detail1). Typically 1.0 - 2.0. */
	detailGain?: number;
	/** Hard limit for detail amplification to prevent haloing. 0.0 - 1.0 (normalized). */
	clampThreshold?: number;
}

/** Separable 3x3 box blur. */
/** Separable 3x3 box blur. Optimized. */
function fastBlur(src: Float32Array, dst: Float32Array, w: number, h: number) {
	const len = w * h * 4;
	const temp = new Float32Array(len);

	// H-pass
	for (let y = 0; y < h; y++) {
		const yOff = y * w;
		for (let x = 0; x < w; x++) {
			const idx = (yOff + x) << 2;
			const xm1 = x > 0 ? x - 1 : 0;
			const xp1 = x < w - 1 ? x + 1 : w - 1;
			const idxL = (yOff + xm1) << 2;
			const idxR = (yOff + xp1) << 2;

			temp[idx] = (src[idxL] + 2 * src[idx] + src[idxR]) * 0.25;
			temp[idx + 1] = (src[idxL + 1] + 2 * src[idx + 1] + src[idxR + 1]) * 0.25;
			temp[idx + 2] = (src[idxL + 2] + 2 * src[idx + 2] + src[idxR + 2]) * 0.25;
			temp[idx + 3] = (src[idxL + 3] + 2 * src[idx + 3] + src[idxR + 3]) * 0.25;
		}
	}

	// V-pass
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			const idx = (y * w + x) << 2;
			const ym1 = y > 0 ? y - 1 : 0;
			const yp1 = y < h - 1 ? y + 1 : h - 1;
			const idxT = (ym1 * w + x) << 2;
			const idxB = (yp1 * w + x) << 2;

			dst[idx] = (temp[idxT] + 2 * temp[idx] + temp[idxB]) * 0.25;
			dst[idx + 1] =
				(temp[idxT + 1] + 2 * temp[idx + 1] + temp[idxB + 1]) * 0.25;
			dst[idx + 2] =
				(temp[idxT + 2] + 2 * temp[idx + 2] + temp[idxB + 2]) * 0.25;
			dst[idx + 3] =
				(temp[idxT + 3] + 2 * temp[idx + 3] + temp[idxB + 3]) * 0.25;
		}
	}
}

/**
 * Soft limiting function (Rational Sigmoid).
 */
function softLimit(x: number, limit: number): number {
	const absX = x < 0 ? -x : x;
	return x / (1 + absX / limit);
}

export function applyWaveletSharpen(
	imageData: ImageData,
	strength = 0.25,
	clampMax = 0.15,
): ImageData {
	const w = imageData.width;
	const h = imageData.height;
	const len = w * h * 4;

	const src = new Float32Array(len);
	const data = imageData.data;
	const inv255 = 1.0 / 255.0;
	for (let i = 0; i < len; i++) {
		src[i] = data[i] * inv255;
	}

	const L1 = new Float32Array(len);
	fastBlur(src, L1, w, h);

	const output = new Uint8ClampedArray(len);
	const gain = strength * 2.0;

	for (let i = 0; i < len; i += 4) {
		// RGB channels
		for (let c = 0; c < 3; c++) {
			const idx = i + c;
			const d1 = src[idx] - L1[idx];
			const boosted = softLimit(d1 * gain, clampMax);
			let res = src[idx] + boosted;

			if (res < 0) res = 0;
			else if (res > 1) res = 1;

			output[idx] = (res * 255.0 + 0.5) | 0;
		}
		// Alpha channel
		output[i + 3] = data[i + 3];
	}

	return new ImageData(output, w, h);
}
