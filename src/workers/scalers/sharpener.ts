import type { DeblurMethod, RawImageData } from "../../types";
import { extractPalette, optimizePaletteBanded } from "../../utils/palette";
import { softLimit } from "../utils";

const applyWaveletSharpen = (
	input: RawImageData,
	strength: number,
	clampMax = 0.15,
): RawImageData => {
	const w = input.width;
	const h = input.height;
	const len = w * h * 4;
	const data = input.data;

	const src = new Float32Array(len);
	const inv255 = 1.0 / 255.0;
	for (let i = 0; i < len; i++) {
		src[i] = data[i] * inv255;
	}

	const temp = new Float32Array(len);
	const L1 = new Float32Array(len);

	// H-pass src -> temp
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

	// V-pass temp -> L1
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			const idx = (y * w + x) << 2;
			const ym1 = y > 0 ? y - 1 : 0;
			const yp1 = y < h - 1 ? y + 1 : h - 1;
			const idxT = (ym1 * w + x) << 2;
			const idxB = (yp1 * w + x) << 2;
			L1[idx] = (temp[idxT] + 2 * temp[idx] + temp[idxB]) * 0.25;
			L1[idx + 1] =
				(temp[idxT + 1] + 2 * temp[idx + 1] + temp[idxB + 1]) * 0.25;
			L1[idx + 2] =
				(temp[idxT + 2] + 2 * temp[idx + 2] + temp[idxB + 2]) * 0.25;
			L1[idx + 3] =
				(temp[idxT + 3] + 2 * temp[idx + 3] + temp[idxB + 3]) * 0.25;
		}
	}

	const outData = new Uint8ClampedArray(len);
	const gain = strength * 2.0;

	for (let i = 0; i < len; i += 4) {
		// RGB channels
		for (let c = 0; c < 3; c++) {
			const idx = i + c;
			const d1 = src[idx] - L1[idx];
			const boosted = softLimit(d1 * gain, clampMax); // Using shared softLimit
			let res = src[idx] + boosted;
			if (res < 0) res = 0;
			else if (res > 1) res = 1;
			outData[idx] = (res * 255.0 + 0.5) | 0;
		}
		// Alpha channel
		outData[i + 3] = data[i + 3];
	}

	return { data: outData, width: w, height: h };
};

const applyBilateralFilter = (
	input: RawImageData,
	strength: number,
): RawImageData => {
	if (strength <= 0) return input;
	const width = input.width;
	const height = input.height;
	const srcData = input.data;
	const srcData32 = new Uint32Array(srcData.buffer);
	const outData = new Uint8ClampedArray(srcData.length);
	const outData32 = new Uint32Array(outData.buffer);

	const spatialSigma = 2.0 * (1 + strength * 2);
	const rangeSigma = 25.0 * (1 + strength);
	const windowRadius = Math.ceil(spatialSigma * 2);

	const spatialWeights = new Float32Array((windowRadius * 2 + 1) ** 2);
	const spatialSigmaSq2 = 2 * spatialSigma * spatialSigma;
	let idx = 0;
	for (let dy = -windowRadius; dy <= windowRadius; dy++) {
		for (let dx = -windowRadius; dx <= windowRadius; dx++) {
			const dist = dx * dx + dy * dy;
			spatialWeights[idx++] = Math.exp(-dist / spatialSigmaSq2);
		}
	}

	const rangeSigmaSq2 = 2 * rangeSigma * rangeSigma;
	const maxColorDist = 255 * 255 * 3;
	const rangeLookup = new Float32Array(maxColorDist + 1);
	for (let i = 0; i <= maxColorDist; i++) {
		rangeLookup[i] = Math.exp(-i / rangeSigmaSq2);
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerPos = y * width + x;
			const centerVal = srcData32[centerPos];
			const centerR = centerVal & 0xff;
			const centerG = (centerVal >> 8) & 0xff;
			const centerB = (centerVal >> 16) & 0xff;
			const centerA = (centerVal >> 24) & 0xff;

			if (centerA < 10) {
				outData32[centerPos] = centerVal;
				continue;
			}

			let sumR = 0;
			let sumG = 0;
			let sumB = 0;
			let sumWeight = 0;

			let weightIdx = 0;
			for (let dy = -windowRadius; dy <= windowRadius; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= height) {
					weightIdx += windowRadius * 2 + 1;
					continue;
				}
				const rowOffset = ny * width;
				for (let dx = -windowRadius; dx <= windowRadius; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= width) {
						weightIdx++;
						continue;
					}

					const nVal = srcData32[rowOffset + nx];
					const nA = (nVal >> 24) & 0xff;
					if (nA < 10) {
						weightIdx++;
						continue;
					}

					const dr = (nVal & 0xff) - centerR;
					const dg = ((nVal >> 8) & 0xff) - centerG;
					const db = ((nVal >> 16) & 0xff) - centerB;
					const colorDist = dr * dr + dg * dg + db * db;
					const weight = spatialWeights[weightIdx] * rangeLookup[colorDist];

					sumR += (nVal & 0xff) * weight;
					sumG += ((nVal >> 8) & 0xff) * weight;
					sumB += ((nVal >> 16) & 0xff) * weight;
					sumWeight += weight;

					weightIdx++;
				}
			}

			if (sumWeight > 0) {
				const invWeight = 1.0 / sumWeight;
				const fr = (sumR * invWeight) | 0;
				const fg = (sumG * invWeight) | 0;
				const fb = (sumB * invWeight) | 0;
				outData32[centerPos] = (centerA << 24) | (fb << 16) | (fg << 8) | fr;
			} else {
				outData32[centerPos] = centerVal;
			}
		}
	}
	return { data: outData, width, height };
};

const findClosestColor = (
	c: { r: number; g: number; b: number },
	palette32: Uint32Array,
): number => {
	let minDist = 1000000;
	let bestColor = palette32[0];
	for (let i = 0; i < palette32.length; i++) {
		const pc = palette32[i];
		const pr = pc & 0xff;
		const pg = (pc >> 8) & 0xff;
		const pb = (pc >> 16) & 0xff;
		const dr = c.r - pr;
		const dg = c.g - pg;
		const db = c.b - pb;
		const dist = dr * dr + dg * dg + db * db;
		if (dist < minDist) {
			minDist = dist;
			bestColor = pc;
		}
	}
	return bestColor;
};

// Internal bicubic scale for Sharpener (re-implemented or imported?)
// For now, implementing simple bicubic here or using shared if available?
// processBicubic from 'bicubic.ts' takes ImageBitmap which is not ideal for internal pipeline
// We need a raw-to-raw bicubic function.
// Let's implement lightweight raw bicubic here or export the one from bicubic.ts if it was raw-capable.
// processBicubic in bicubic.ts uses OffscreenCanvas which works with ImageBitmap.
// Sharpener pipeline: Raw -> Canvas Scale -> Raw -> Sharpen.
// So we can use OffscreenCanvas here too if we maintain consistency.

const applyBicubicScaling = (
	input: RawImageData,
	targetW: number,
	targetH: number,
): RawImageData => {
	// Convert RawImageData to ImageData for Canvas
	const canvas = new OffscreenCanvas(targetW, targetH);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Context failed");

	// Create temp canvas for input
	const srcCanvas = new OffscreenCanvas(input.width, input.height);
	const srcCtx = srcCanvas.getContext("2d");
	if (!srcCtx) throw new Error("Src Context failed");

	const srcImgData = new ImageData(input.data, input.width, input.height);
	srcCtx.putImageData(srcImgData, 0, 0);

	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(srcCanvas, 0, 0, targetW, targetH);

	const out = ctx.getImageData(0, 0, targetW, targetH);
	return { data: out.data, width: targetW, height: targetH };
};

export const processSharpener = (
	input: RawImageData,
	targetW: number,
	targetH: number,
	deblurMethod: DeblurMethod,
	bilateralStrength: number,
	waveletStrength: number,
	maxColorsPerShade: number,
): RawImageData => {
	const scaled = applyBicubicScaling(input, targetW, targetH);

	let processed = scaled;
	if (deblurMethod === "bilateral" && bilateralStrength > 0) {
		processed = applyBilateralFilter(scaled, bilateralStrength);
	} else if (deblurMethod === "wavelet") {
		processed = applyWaveletSharpen(scaled, waveletStrength, 0.1);
	}

	if (maxColorsPerShade === 0) {
		return processed;
	}

	const extractedPalette = extractPalette(processed);
	const optimizedPalette = optimizePaletteBanded(
		extractedPalette,
		maxColorsPerShade,
	);

	const palette32 = new Uint32Array(optimizedPalette.length);
	for (let i = 0; i < optimizedPalette.length; i++) {
		const p = optimizedPalette[i];
		palette32[i] = (255 << 24) | (p.b << 16) | (p.g << 8) | p.r;
	}

	const len = processed.width * processed.height;
	const finalData32 = new Uint32Array(processed.data.buffer);
	for (let i = 0; i < len; i++) {
		const val = finalData32[i];
		if (((val >> 24) & 0xff) > 25) {
			const r = val & 0xff;
			const g = (val >> 8) & 0xff;
			const b = (val >> 16) & 0xff;
			const best = findClosestColor({ r, g, b }, palette32);
			finalData32[i] = (255 << 24) | (best & 0xffffff);
		} else {
			finalData32[i] = 0;
		}
	}

	return processed;
};
