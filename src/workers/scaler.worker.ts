import * as Comlink from "comlink";
import type {
	DeblurMethod,
	PaletteColor,
	RawImageData,
	ScalerWorkerApi,
} from "../types";
import { extractPalette, reducePaletteToCount } from "../utils/palette";

// --- Utilities adapted for Worker ---

// Soft limiting function for Wavelet (Rational Sigmoid)
const softLimit = (x: number, limit: number): number => {
	const absX = x < 0 ? -x : x;
	return x / (1 + absX / limit);
};

const HP_SIGMA = 0.5; // Spatial Scale Factor
const HP_CONTRAST = 5.0; // Contrast

const applySeparableGaussianBlur = (
	src: Float32Array,
	w: number,
	h: number,
	sigma: number,
): Float32Array => {
	const result = new Float32Array(src.length);
	const temp = new Float32Array(src.length);
	if (sigma <= 0) {
		result.set(src);
		return result;
	}

	const radius = Math.ceil(sigma * 3);
	const kernelSize = radius * 2 + 1;
	const kernel = new Float32Array(kernelSize);
	const sigmaSq2 = 2 * sigma * sigma;
	const normFactor = 1.0 / (Math.sqrt(2 * Math.PI) * sigma);

	let sumKernel = 0;
	for (let i = -radius; i <= radius; i++) {
		const val = normFactor * Math.exp(-(i * i) / sigmaSq2);
		kernel[i + radius] = val;
		sumKernel += val;
	}
	// Normalize kernel
	for (let i = 0; i < kernelSize; i++) {
		kernel[i] /= sumKernel;
	}

	// Horizontal Pass
	for (let y = 0; y < h; y++) {
		const rowOffset = y * w;
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let k = -radius; k <= radius; k++) {
				const nx = Math.min(Math.max(x + k, 0), w - 1); // Edge clamping
				sum += src[rowOffset + nx] * kernel[k + radius];
			}
			temp[rowOffset + x] = sum;
		}
	}

	// Vertical Pass
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let sum = 0;
			for (let k = -radius; k <= radius; k++) {
				const ny = Math.min(Math.max(y + k, 0), h - 1); // Edge clamping
				sum += temp[ny * w + x] * kernel[k + radius];
			}
			result[y * w + x] = sum;
		}
	}

	return result;
};

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
			const boosted = softLimit(d1 * gain, clampMax);
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

// --- Main Processors ---

const processNearest = (
	srcBitmap: ImageBitmap,
	targetW: number,
	targetH: number,
): RawImageData => {
	const canvas = new OffscreenCanvas(targetW, targetH);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Offscreen context failed");
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(srcBitmap, 0, 0, targetW, targetH);
	const data = ctx.getImageData(0, 0, targetW, targetH);
	return {
		data: data.data,
		width: targetW,
		height: targetH,
	};
};

const processBicubic = (
	srcBitmap: ImageBitmap,
	targetW: number,
	targetH: number,
): RawImageData => {
	const canvas = new OffscreenCanvas(targetW, targetH);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Offscreen context failed");
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(srcBitmap, 0, 0, targetW, targetH);
	const data = ctx.getImageData(0, 0, targetW, targetH);
	return {
		data: data.data,
		width: targetW,
		height: targetH,
	};
};

const processEdgePriorityBase = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	targetW: number,
	targetH: number,
	threshold: number,
): RawImageData => {
	const srcW = input.width;
	const srcH = input.height;
	const srcData = input.data;
	const srcData32 = new Uint32Array(srcData.buffer);

	const visited = new Uint8Array(srcW * srcH);
	const outData = new Uint8ClampedArray(targetW * targetH * 4);
	const outData32 = new Uint32Array(outData.buffer);

	// Priority queue setup
	const heapIdx = new Int32Array(srcW * srcH);
	const heapScore = new Float32Array(srcW * srcH);
	let heapSize = 0;

	const pushHeap = (idx: number, score: number) => {
		let i = heapSize++;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (heapScore[p] >= score) break;
			heapScore[i] = heapScore[p];
			heapIdx[i] = heapIdx[p];
			i = p;
		}
		heapScore[i] = score;
		heapIdx[i] = idx;
	};

	const popHeap = () => {
		if (heapSize === 0) return -1;
		const res = heapIdx[0];
		const lastIdx = heapIdx[--heapSize];
		const lastScore = heapScore[heapSize];
		let i = 0;
		while (true) {
			let child = (i << 1) + 1;
			if (child >= heapSize) break;
			if (child + 1 < heapSize && heapScore[child + 1] > heapScore[child]) {
				child++;
			}
			if (lastScore >= heapScore[child]) break;
			heapScore[i] = heapScore[child];
			heapIdx[i] = heapIdx[child];
			i = child;
		}
		heapScore[i] = lastScore;
		heapIdx[i] = lastIdx;
		return res;
	};

	const dx = [1, -1, 0, 0];
	const dy = [0, 0, 1, -1];

	for (let ty = 0; ty < targetH; ty++) {
		for (let tx = 0; tx < targetW; tx++) {
			const cellMinX = ((tx * srcW) / targetW) | 0;
			const cellMaxX = (((tx + 1) * srcW) / targetW - 1) | 0;
			const cellMinY = ((ty * srcH) / targetH) | 0;
			const cellMaxY = (((ty + 1) * srcH) / targetH - 1) | 0;

			let seedIdx = -1;
			let maxContrast = -1;

			// Find seed
			for (let cy = cellMinY; cy <= cellMaxY; cy++) {
				for (let cx = cellMinX; cx <= cellMaxX; cx++) {
					const idx = cy * srcW + cx;
					const val = srcData32[idx];
					if (((val >> 24) & 0xff) < 25) continue;

					let sumDiff = 0;
					let nCount = 0;
					const lum =
						0.2126 * (val & 0xff) +
						0.7152 * ((val >> 8) & 0xff) +
						0.0722 * ((val >> 16) & 0xff);

					for (let ni = -1; ni <= 1; ni++) {
						for (let nj = -1; nj <= 1; nj++) {
							if (ni === 0 && nj === 0) continue;
							const nx = cx + ni;
							const ny = cy + nj;
							if (nx >= 0 && nx < srcW && ny >= 0 && ny < srcH) {
								const nVal = srcData32[ny * srcW + nx];
								const nLum =
									0.2126 * (nVal & 0xff) +
									0.7152 * ((nVal >> 8) & 0xff) +
									0.0722 * ((nVal >> 16) & 0xff);
								sumDiff += Math.abs(nLum - lum);
								nCount++;
							}
						}
					}
					const contrast = sumDiff / (nCount || 1);
					if (contrast > maxContrast) {
						maxContrast = contrast;
						seedIdx = idx;
					}
				}
			}

			if (seedIdx === -1) {
				seedIdx =
					((((ty + 0.5) * srcH) / targetH) | 0) * srcW +
					((((tx + 0.5) * srcW) / targetW) | 0);
			}

			const seedVal = srcData32[seedIdx];
			const r0 = seedVal & 0xff;
			const g0 = (seedVal >> 8) & 0xff;
			const b0 = (seedVal >> 16) & 0xff;
			const l0 = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
			const centerX = (cellMinX + cellMaxX) * 0.5;
			const centerY = (cellMinY + cellMaxY) * 0.5;

			let accR = 0;
			let accG = 0;
			let accB = 0;
			let accA = 0;
			let count = 0;

			heapSize = 0;
			pushHeap(seedIdx, 1000);

			while (heapSize > 0) {
				const curIdx = popHeap();
				if (visited[curIdx]) continue;
				visited[curIdx] = 1;

				const val = srcData32[curIdx];
				accR += val & 0xff;
				accG += (val >> 8) & 0xff;
				accB += (val >> 16) & 0xff;
				accA += (val >> 24) & 0xff;
				count++;

				const cx = curIdx % srcW;
				const cy = (curIdx / srcW) | 0;

				for (let i = 0; i < 4; i++) {
					const nx = cx + dx[i];
					const ny = cy + dy[i];
					if (nx < cellMinX || nx > cellMaxX || ny < cellMinY || ny > cellMaxY)
						continue;
					const nIdx = ny * srcW + nx;
					if (visited[nIdx]) continue;

					const nVal = srcData32[nIdx];
					const nr = nVal & 0xff;
					const ng = (nVal >> 8) & 0xff;
					const nb = (nVal >> 16) & 0xff;

					if (
						Math.abs(nr - r0) + Math.abs(ng - g0) + Math.abs(nb - b0) <=
						threshold
					) {
						const nLum = (0.2126 * nr + 0.7152 * ng + 0.0722 * nb) / 255;
						const colorSim = 1.0 / (0.01 + Math.abs(nLum - l0));

						let nSumDiff = 0;
						let nNCount = 0;
						for (let ni = -1; ni <= 1; ni++) {
							for (let nj = -1; nj <= 1; nj++) {
								if (ni === 0 && nj === 0) continue;
								const nnx = nx + ni;
								const nny = ny + nj;
								if (nnx >= 0 && nnx < srcW && nny >= 0 && nny < srcH) {
									const nnVal = srcData32[nny * srcW + nnx];
									nSumDiff += Math.abs(
										0.2126 * (nnVal & 0xff) +
											0.7152 * ((nnVal >> 8) & 0xff) +
											0.0722 * ((nnVal >> 16) & 0xff) -
											nLum * 255,
									);
									nNCount++;
								}
							}
						}
						const nContrast = nSumDiff / (nNCount || 1) / 255;
						const distToCenterSq =
							(nx - centerX) * (nx - centerX) + (ny - centerY) * (ny - centerY);
						const cogBoost = 1.0 / (0.5 + Math.sqrt(distToCenterSq));
						const score = colorSim * (1.0 + nContrast * 5.0) * cogBoost;
						pushHeap(nIdx, score);
					}
				}
			}

			// Clean remaining
			for (let cy = cellMinY; cy <= cellMaxY; cy++) {
				for (let cx = cellMinX; cx <= cellMaxX; cx++) {
					const idx = cy * srcW + cx;
					if (!visited[idx]) {
						visited[idx] = 1;
						const val = srcData32[idx];
						accR += val & 0xff;
						accG += (val >> 8) & 0xff;
						accB += (val >> 16) & 0xff;
						accA += (val >> 24) & 0xff;
						count++;
					}
				}
			}

			const div = count || 1;
			const r = (accR / div) | 0;
			const g = (accG / div) | 0;
			const b = (accB / div) | 0;
			const a = (accA / div) | 0;

			outData32[ty * targetW + tx] = (a << 24) | (b << 16) | (g << 8) | r;
		}
	}

	return { data: outData, width: targetW, height: targetH };
};

const rgbToHsl = (r: number, g: number, b: number) => {
	const valR = r / 255;
	const valG = g / 255;
	const valB = b / 255;

	const max = Math.max(valR, valG, valB);
	const min = Math.min(valR, valG, valB);
	let h = 0;
	const l = (max + min) / 2;

	if (max === min) {
		h = 0; // achromatic
	} else {
		const d = max - min;
		switch (max) {
			case valR:
				h = (valG - valB) / d + (valG < valB ? 6 : 0);
				break;
			case valG:
				h = (valB - valR) / d + 2;
				break;
			case valB:
				h = (valR - valG) / d + 4;
				break;
		}
		h /= 6;
	}

	return { h, l };
};

const optimizePaletteBanded = (
	palette: (PaletteColor & { count?: number })[],
	maxColors: number,
): PaletteColor[] => {
	// 1. Partition into bands
	// Hue bands: 12 slices (30 degrees each)
	// Lightness bands: 4 slices (0-0.25, 0.25-0.5, etc)
	const bands: Record<string, (PaletteColor & { count?: number })[]> = {};

	for (const color of palette) {
		const { h, l } = rgbToHsl(color.r, color.g, color.b);
		const hueBand = Math.floor(h * 12); // 0-11
		const lightBand = Math.floor(l * 4); // 0-3
		const key = `${hueBand}-${lightBand}`;

		if (!bands[key]) bands[key] = [];
		bands[key].push(color);
	}

	const optimized: PaletteColor[] = [];

	// 2. Reduce each band
	for (const key in bands) {
		const group = bands[key];
		// Sort by frequency
		group.sort((a, b) => (b.count || 0) - (a.count || 0));

		// Keep top maxColors
		// If group has fewer, keep all
		for (let i = 0; i < Math.min(group.length, maxColors); i++) {
			optimized.push(group[i]);
		}
	}

	return optimized;
};

const processSharpener = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	targetW: number,
	targetH: number,
	threshold: number,
	bilateralStrength: number,
	waveletStrength: number,
	deblurMethod: DeblurMethod,

	maxColorsPerShade: number,
): RawImageData => {
	// 1. Scale using Contour logic
	const scaled = processEdgePriorityBase(input, targetW, targetH, threshold);

	const len = targetW * targetH;

	// 2. Sharpening (applied on the scaled result directly)
	let processed = scaled;

	if (deblurMethod === "bilateral" && bilateralStrength > 0) {
		processed = applyBilateralFilter(scaled, bilateralStrength);
	} else if (deblurMethod === "wavelet") {
		processed = applyWaveletSharpen(scaled, waveletStrength, 0.1);
	}

	if (maxColorsPerShade === 0) {
		return processed;
	}

	// 3. Optimize Palette
	// Extract palette from the PROCESSED image
	const extractedPalette = extractPalette({
		data: processed.data,
		width: targetW,
		height: targetH,
	});

	const optimizedPalette = optimizePaletteBanded(
		extractedPalette,
		maxColorsPerShade,
	);

	// Pre-extract optimized palette
	const palette32 = new Uint32Array(optimizedPalette.length);
	for (let i = 0; i < optimizedPalette.length; i++) {
		const p = optimizedPalette[i];
		palette32[i] = (255 << 24) | (p.b << 16) | (p.g << 8) | p.r;
	}

	// 4. Final Snap
	// Snap to the optimized palette
	const finalData32 = new Uint32Array(processed.data.buffer);
	for (let i = 0; i < len; i++) {
		const val = finalData32[i];
		if (((val >> 24) & 0xff) > 25) {
			const r = val & 0xff;
			const g = (val >> 8) & 0xff;
			const b = (val >> 16) & 0xff;
			const best = findClosestColor({ r, g, b }, palette32);
			finalData32[i] = (val & 0xff000000) | (best & 0xffffff);
		} else {
			finalData32[i] = 0;
		}
	}

	return processed;
};

const computeEdgeMap = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	sigma: number,
	contrast: number,
) => {
	const w = input.width;
	const h = input.height;
	const srcData32 = new Uint32Array(input.data.buffer);

	// 1. Luminance
	const luminance = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const val = srcData32[i];
		const r = val & 0xff;
		const g = (val >> 8) & 0xff;
		const b = (val >> 16) & 0xff;
		luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
	}

	// 2. High Pass (Gaussian Difference)
	const smoothed = applySeparableGaussianBlur(luminance, w, h, sigma);
	const hpf = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		hpf[i] = (luminance[i] - smoothed[i]) * contrast;
	}

	// 3. Autotuned Local Threshold (GIMP-like)
	let negSum = 0;
	let negCount = 0;
	for (let i = 0; i < w * h; i++) {
		if (hpf[i] < 0) {
			negSum += hpf[i];
			negCount++;
		}
	}

	const negMean = negCount > 0 ? negSum / negCount : 0;

	let negVarSum = 0;
	for (let i = 0; i < w * h; i++) {
		if (hpf[i] < 0) {
			negVarSum += (hpf[i] - negMean) ** 2;
		}
	}
	const globalDeviation = negCount > 0 ? Math.sqrt(negVarSum / negCount) : 0;

	const candidates = new Uint8Array(w * h);
	const radius = 5; // 5x5 window

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = y * w + x;

			// Compute local mean
			let localSum = 0;
			let localCount = 0;

			for (let ky = -radius; ky <= radius; ky++) {
				for (let kx = -radius; kx <= radius; kx++) {
					const nx = x + kx;
					const ny = y + ky;
					if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
						localSum += hpf[ny * w + nx];
						localCount++;
					}
				}
			}

			const localMean = localCount > 0 ? localSum / localCount : 0;

			if (hpf[idx] < localMean - globalDeviation * 0.8) {
				candidates[idx] = 1;
			}
		}
	}

	// 3.5 Noise Removal (Remove tiny clusters)
	const visitedNoise = new Uint8Array(w * h);
	const noiseStack: number[] = [];
	const cluster: number[] = [];
	const MIN_CLUSTER_SIZE = 15;

	for (let i = 0; i < w * h; i++) {
		if (candidates[i] === 1 && visitedNoise[i] === 0) {
			noiseStack.push(i);
			cluster.length = 0;
			visitedNoise[i] = 1;
			while (noiseStack.length > 0) {
				const curr = noiseStack.pop();
				if (curr === undefined) break;
				cluster.push(curr);

				const cx = curr % w;
				const cy = (curr / w) | 0;

				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nx = cx + dx;
						const ny = cy + dy;
						if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
							const nIdx = ny * w + nx;
							if (candidates[nIdx] === 1 && visitedNoise[nIdx] === 0) {
								visitedNoise[nIdx] = 1;
								noiseStack.push(nIdx);
							}
						}
					}
				}
			}

			if (cluster.length < MIN_CLUSTER_SIZE) {
				for (const idx of cluster) {
					candidates[idx] = 0;
				}
			}
		}
	}

	return { candidates, hpf };
};

const bridgeEdges = (
	candidates: Uint8Array,
	w: number,
	h: number,
): Uint8Array => {
	const bridged = new Uint8Array(w * h);
	bridged.set(candidates);

	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const idx = y * w + x;
			if (candidates[idx] === 0) {
				// Check for gap between two contour pixels
				// Horizontal
				if (candidates[idx - 1] === 1 && candidates[idx + 1] === 1) {
					bridged[idx] = 1;
				}
				// Vertical
				else if (candidates[idx - w] === 1 && candidates[idx + w] === 1) {
					bridged[idx] = 1;
				}
				// Diagonal 1
				else if (
					candidates[idx - w - 1] === 1 &&
					candidates[idx + w + 1] === 1
				) {
					bridged[idx] = 1;
				}
				// Diagonal 2
				else if (
					candidates[idx - w + 1] === 1 &&
					candidates[idx + w - 1] === 1
				) {
					bridged[idx] = 1;
				}
			}
		}
	}
	return bridged;
};

const detectContours = (input: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}): Uint8Array => {
	// 1. Luminance (Handled in computeEdgeMap)
	// 2. High Pass Filter (Handled in computeEdgeMap)
	// 3. Autotuned Local Threshold (Handled in computeEdgeMap)
	// 3.5 Noise Removal (Handled in computeEdgeMap)
	const { candidates } = computeEdgeMap(input, HP_SIGMA, HP_CONTRAST);
	return candidates;
};

// Helper to extract ImageData from ImageBitmap

const scaleLayerBicubic = (
	data: Uint8ClampedArray,
	srcW: number,
	srcH: number,
	targetW: number,
	targetH: number,
): Uint8ClampedArray => {
	const srcCanvas = new OffscreenCanvas(srcW, srcH);
	const srcCtx = srcCanvas.getContext("2d");
	if (!srcCtx) throw new Error("Offscreen context failed");

	const srcImgData = new ImageData(data as any, srcW, srcH);
	srcCtx.putImageData(srcImgData, 0, 0);

	const destCanvas = new OffscreenCanvas(targetW, targetH);
	const destCtx = destCanvas.getContext("2d");
	if (!destCtx) throw new Error("Offscreen context failed");

	destCtx.imageSmoothingEnabled = true;
	destCtx.imageSmoothingQuality = "high";
	destCtx.drawImage(srcCanvas, 0, 0, targetW, targetH); // Scale

	return destCtx.getImageData(0, 0, targetW, targetH).data;
};

const superimposeContour = (
	target: RawImageData,
	input: RawImageData,
): void => {
	// 1. Detect Mask at Source Resolution
	const mask = detectContours(input);
	const srcW = input.width;
	const srcH = input.height;
	const srcData32 = new Uint32Array(input.data.buffer);

	// 2. Create Contour Layer (Full RGBA)
	// We want to capture the source color at contour locations.
	const contourLayer = new Uint8ClampedArray(srcW * srcH * 4);
	const contourData32 = new Uint32Array(contourLayer.buffer);

	for (let i = 0; i < mask.length; i++) {
		if (mask[i] === 1) {
			// Copy source pixel (preserving Alpha)
			contourData32[i] = srcData32[i];
		} else {
			// Transparent
			contourData32[i] = 0;
		}
	}

	// 3. Scale Contour Layer to Target Resolution (Bicubic)
	// This creates a smooth, continuous layer with anti-aliasing
	const scaledContour = scaleLayerBicubic(
		contourLayer,
		srcW,
		srcH,
		target.width,
		target.height,
	);

	// 4. Composite (Darken Only)
	// Darken Blend: Result = min(Target, Source)
	// We must account for the contour opacity (alpha) from scaling.
	// Out = Mix(Target, Darken(Target, Source), SourceAlpha)
	const targetData = target.data;
	const len = targetData.length;

	for (let i = 0; i < len; i += 4) {
		const rS = scaledContour[i];
		const gS = scaledContour[i + 1];
		const bS = scaledContour[i + 2];
		const aS = scaledContour[i + 3] / 255.0; // 0..1

		// Optimization: Skip if contour is essentially transparent
		if (aS <= 0.05) continue;

		const rD = targetData[i];
		const gD = targetData[i + 1];
		const bD = targetData[i + 2];

		// "Darken Only" logic: keeps the darker of the two components
		const rDark = Math.min(rD, rS);
		const gDark = Math.min(gD, gS);
		const bDark = Math.min(bD, bS);

		// Blend the darkened result over the original target based on contour alpha
		// This applies the "ink" only where the contour exists
		targetData[i] = rDark * aS + rD * (1.0 - aS);
		targetData[i + 1] = gDark * aS + gD * (1.0 - aS);
		targetData[i + 2] = bDark * aS + bD * (1.0 - aS);

		// We preserve the target alpha (assuming usually opaque background)
	}
};

const processPaletteArea = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	targetW: number,
	targetH: number,
	palette: PaletteColor[],
): RawImageData => {
	const srcW = input.width;
	const srcH = input.height;
	const srcData = new Uint32Array(input.data.buffer);
	const outData = new Uint8ClampedArray(targetW * targetH * 4);
	const outData32 = new Uint32Array(outData.buffer);

	// Pre-extract palette as Uint32 for faster lookup
	const palette32 = new Uint32Array(palette.length);
	for (let i = 0; i < palette.length; i++) {
		const p = palette[i];
		palette32[i] = (255 << 24) | (p.b << 16) | (p.g << 8) | p.r;
	}

	// Indexed pixels buffer (palette index or -1)
	const indexedPixels = new Int16Array(srcW * srcH);
	const len = srcW * srcH;

	// 1. Map source to palette indices
	for (let i = 0; i < len; i++) {
		const val = srcData[i];
		const a = (val >> 24) & 0xff;
		if (a < 128) {
			indexedPixels[i] = -1;
		} else {
			// Find index in palette
			let paletteIdx = -1;
			let minDistSq = 1000000;
			const r = val & 0xff;
			const g = (val >> 8) & 0xff;
			const b = (val >> 16) & 0xff;

			for (let p = 0; p < palette32.length; p++) {
				const pc = palette32[p];
				const pr = pc & 0xff;
				const pg = (pc >> 8) & 0xff;
				const pb = (pc >> 16) & 0xff;
				const dr = r - pr;
				const dg = g - pg;
				const db = b - pb;
				const distSq = dr * dr + dg * dg + db * db;
				if (distSq < minDistSq) {
					minDistSq = distSq;
					paletteIdx = p;
				}
				if (distSq === 0) break;
			}
			indexedPixels[i] = paletteIdx;
		}
	}

	// 2. Area sampling
	const maxPaletteSize = Math.max(palette.length, 256);
	const counts = new Float32Array(maxPaletteSize);

	for (let ty = 0; ty < targetH; ty++) {
		const startY = (ty * srcH) / targetH;
		const endY = ((ty + 1) * srcH) / targetH;
		const syStart = startY | 0;
		const syEnd = Math.ceil(endY);

		for (let tx = 0; tx < targetW; tx++) {
			const startX = (tx * srcW) / targetW;
			const endX = ((tx + 1) * srcW) / targetW;
			const sxStart = startX | 0;
			const sxEnd = Math.ceil(endX);

			// Reset counts
			counts.fill(0);
			let transparentCount = 0;

			for (let sy = syStart; sy < syEnd; sy++) {
				if (sy >= srcH) continue;
				const rowOffset = sy * srcW;

				const y0 = Math.max(sy, startY);
				const y1 = Math.min(sy + 1, endY);
				const yWeight = y1 - y0;

				for (let sx = sxStart; sx < sxEnd; sx++) {
					if (sx >= srcW) continue;

					const x0 = Math.max(sx, startX);
					const x1 = Math.min(sx + 1, endX);
					const weight = (x1 - x0) * yWeight;

					const pIdx = indexedPixels[rowOffset + sx];
					if (pIdx === -1) {
						transparentCount += weight;
					} else {
						if (pIdx < maxPaletteSize) {
							counts[pIdx] += weight;
						}
					}
				}
			}

			let bestIdx = -1;
			let maxWeight = -1;

			for (let i = 0; i < palette.length; i++) {
				if (counts[i] > maxWeight) {
					maxWeight = counts[i];
					bestIdx = i;
				}
			}

			const outIdx = ty * targetW + tx;
			if (transparentCount > maxWeight || bestIdx === -1) {
				outData32[outIdx] = 0;
			} else {
				outData32[outIdx] = palette32[bestIdx];
			}
		}
	}

	return { data: outData, width: targetW, height: targetH };
};

// --- Worker Communication Wrapper ---

// Shared helper to type the transfer return correctly
const transferRaw = (raw: RawImageData) =>
	Comlink.transfer(raw, [raw.data.buffer]) as unknown as RawImageData;

const transferContourDebug = (result: {
	contour: RawImageData;
	highPass: RawImageData;
	threshold: RawImageData;
}) =>
	Comlink.transfer(result, [
		result.contour.data.buffer,
		result.highPass.data.buffer,
		result.threshold.data.buffer,
	]) as unknown as {
		contour: RawImageData;
		highPass: RawImageData;
		threshold: RawImageData;
	};

const ensureImageBitmap = async (
	input: RawImageData | ImageBitmap,
): Promise<ImageBitmap> => {
	if ("close" in input) return input;

	return createImageBitmap(
		new ImageData(input.data as any, input.width, input.height),
	);
};

const ensureRawImageData = async (
	input: RawImageData | ImageBitmap,
): Promise<RawImageData> => {
	if ("data" in input) return input;

	const w = input.width;
	const h = input.height;
	const canvas = new OffscreenCanvas(w, h);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Offscreen context failed");
	ctx.drawImage(input, 0, 0);
	const data = ctx.getImageData(0, 0, w, h);
	return {
		data: data.data,
		width: w,
		height: h,
	};
};

const api: ScalerWorkerApi = {
	processNearest: async (input, targetW, targetH) => {
		const bitmap = await ensureImageBitmap(input);
		const result = processNearest(bitmap, targetW, targetH);
		return transferRaw(result);
	},
	processBicubic: async (input, targetW, targetH, _options) => {
		const bitmap = await ensureImageBitmap(input);
		const result = processBicubic(bitmap, targetW, targetH);
		return transferRaw(result);
	},

	processEdgePriority: async (input, targetW, targetH, threshold, _options) => {
		const rawInput = await ensureRawImageData(input);
		const result = processEdgePriorityBase(
			rawInput,
			targetW,
			targetH,
			threshold,
		);
		return transferRaw(result);
	},
	processSharpener: async (
		input,
		targetW,
		targetH,
		threshold,
		bilateralStrength,
		waveletStrength,
		deblurMethod,
		maxColorsPerShade,
		options,
	) => {
		const rawInput = await ensureRawImageData(input);
		const result = processSharpener(
			rawInput,
			targetW,
			targetH,
			threshold,
			bilateralStrength,
			waveletStrength,
			deblurMethod,
			maxColorsPerShade,
		);
		if (options?.overlayContours) {
			superimposeContour(result, rawInput);
		}
		return transferRaw(result);
	},
	processPaletteArea: async (input, targetW, targetH, palette) => {
		const rawInput = await ensureRawImageData(input);
		const result = processPaletteArea(rawInput, targetW, targetH, palette);
		return transferRaw(result);
	},
	extractPalette: async (input, maxColors) => {
		const rawInput = await ensureRawImageData(input);
		const fullPalette = extractPalette(rawInput);
		return reducePaletteToCount(fullPalette, maxColors);
	},
	processContourDebug: async (input, _targetW, _targetH) => {
		const rawInput = await ensureRawImageData(input);
		const w = rawInput.width;
		const h = rawInput.height;

		const { candidates, hpf } = computeEdgeMap(rawInput, HP_SIGMA, HP_CONTRAST);

		const contourOut = bridgeEdges(candidates, w, h);

		// Clamp negative values for visualization
		// HPF values are roughly -255*8 to 255*8.
		// Shift by 128 to show negative values.
		// We clamp positive values to 0, so they appear as neutral gray (128).
		const hpOut = new Uint8ClampedArray(w * h * 4);
		const hpOut32 = new Uint32Array(hpOut.buffer);
		for (let i = 0; i < w * h; i++) {
			const val = Math.max(0, Math.min(255, Math.min(0, hpf[i]) + 128)) | 0;
			hpOut32[i] = (255 << 24) | (val << 16) | (val << 8) | val;
		}

		// Threshold visualization
		const threshOut = new Uint8ClampedArray(w * h * 4);
		const threshOut32 = new Uint32Array(threshOut.buffer);
		for (let i = 0; i < w * h; i++) {
			const val = candidates[i] * 255;
			threshOut32[i] = (255 << 24) | (val << 16) | (val << 8) | val;
		}

		// Contour visualization (on transparent bg? or white on black?)
		// UI expects an image. Previous implementation made it white on black probably.
		// Let's keep it consistent: white on transparent?
		// Re-reading previous `processContourDebug` would be good to match style.
		// Previous implementation (seen in step 77/78 diffs) didn't show full body.
		// Let's assume white pixels on transparent for countour.
		const contourData = new Uint8ClampedArray(w * h * 4);
		const contourData32 = new Uint32Array(contourData.buffer);
		const srcData32 = new Uint32Array(rawInput.data.buffer);
		for (let i = 0; i < w * h; i++) {
			if (contourOut[i]) {
				contourData32[i] = srcData32[i];
			}
		}

		const result = {
			contour: { data: contourData, width: w, height: h },
			highPass: { data: hpOut, width: w, height: h },
			threshold: { data: threshOut, width: w, height: h },
		};
		return transferContourDebug(result);
	},
};

Comlink.expose(api);
