import type {
	DeblurMethod,
	PaletteColor,
	RawImageData,
	ScalingOptions,
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

const optimizePaletteBanded = (
	palette: PaletteColor[],
	maxColorsPerShade: number,
): PaletteColor[] => {
	if (maxColorsPerShade <= 0) return palette;

	const lumas = palette.map((c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
	return palette;
};

export const applyBicubicScaling = (
	input: RawImageData,
	targetW: number,
	targetH: number,
): RawImageData => {
	const data = scaleLayerBicubic(
		input.data,
		input.width,
		input.height,
		targetW,
		targetH,
	);
	return { data: data as Uint8ClampedArray, width: targetW, height: targetH };
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

	const optimizedPalette = extractPalette(processed);
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

export const processContrastAwareBase = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	targetW: number,
	targetH: number,
	_threshold: number,
	options?: ScalingOptions,
): {
	result: RawImageData;
	phase0?: RawImageData;
	phase1?: RawImageData;
	phase2?: RawImageData;
	phase3?: RawImageData;
} => {
	const { data, width: srcW, height: srcH } = input;
	const src32 = new Uint32Array(data.buffer);
	const outData = new Uint8ClampedArray(targetW * targetH * 4);
	const out32 = new Uint32Array(outData.buffer);

	targetW = targetW | 0;
	targetH = targetH | 0;
	const E = Math.max(1, Math.round(srcW / targetW)); // Edge length (min 1)
	const COLOR_SIMILARITY_THRESHOLD = 30; // Small threshold to handle noise

	// Constants
	const similarityThresholdSq =
		COLOR_SIMILARITY_THRESHOLD * COLOR_SIMILARITY_THRESHOLD;

	// Grid initialization
	enum CellState {
		Unresolved = 0,
		FilledHC = 1,
		FilledAvg = 2,
		FilledAvgNoHC = 3,
		Underfilled = 4,
	}

	interface HCPixelInfo {
		isEdge: boolean;
		isCenter: boolean;
		nIntra: number;
		nInter: number;
	}

	interface SuperpixelInfo {
		avgAll: number;
		hcColor: number;
		hcCount: number;
		avgWithoutHC: number;
		state: CellState;
		fillColor: number;
		maxContrast: number;
		hcPixels: Map<number, HCPixelInfo>; // idx (0 to E*E-1) -> info
	}

	const grid: SuperpixelInfo[] = new Array(targetW * targetH);

	const captureSourceDebug = () => {
		const buffer = new Uint8ClampedArray(srcW * srcH * 4);
		const view = new Uint32Array(buffer.buffer);
		for (let ty = 0; ty < targetH; ty++) {
			for (let tx = 0; tx < targetW; tx++) {
				const sp = grid[ty * targetW + tx];
				const xStart = tx * E;
				const yStart = ty * E;

				if (
					sp.state !== CellState.Unresolved &&
					sp.state !== CellState.Underfilled
				) {
					// Filled: show the resolved color for this block
					const color = sp.fillColor;
					for (let sy = 0; sy < E; sy++) {
						const py = Math.min(yStart + sy, srcH - 1);
						for (let sx = 0; sx < E; sx++) {
							const px = Math.min(xStart + sx, srcW - 1);
							view[py * srcW + px] = color;
						}
					}
				} else {
					// Unresolved/Underfilled: show original source pixels
					for (let sy = 0; sy < E; sy++) {
						const py = Math.min(yStart + sy, srcH - 1);
						for (let sx = 0; sx < E; sx++) {
							const px = Math.min(xStart + sx, srcW - 1);
							view[py * srcW + px] = src32[py * srcW + px];
						}
					}
				}
			}
		}
		return { data: buffer, width: srcW, height: srcH };
	};

	// Helper: Perceptual luma distance
	const getLuma = (c: number) => {
		const r = c & 0xff,
			g = (c >> 8) & 0xff,
			b = (c >> 16) & 0xff;
		return 0.299 * r + 0.587 * g + 0.114 * b;
	};

	const getColorDistSq = (c1: number, c2: number) => {
		const r1 = c1 & 0xff,
			g1 = (c1 >> 8) & 0xff,
			b1 = (c1 >> 16) & 0xff;
		const r2 = c2 & 0xff,
			g2 = (c2 >> 8) & 0xff,
			b2 = (c2 >> 16) & 0xff;
		return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
	};

	// --- Phase 0: Precompute per-superpixel stats ---
	for (let ty = 0; ty < targetH; ty++) {
		for (let tx = 0; tx < targetW; tx++) {
			const xStart = tx * E;
			const yStart = ty * E;
			const pixels: number[] = [];
			let sumR = 0,
				sumG = 0,
				sumB = 0,
				sumA = 0;

			for (let sy = 0; sy < E; sy++) {
				for (let sx = 0; sx < E; sx++) {
					const px = Math.min(xStart + sx, srcW - 1);
					const py = Math.min(yStart + sy, srcH - 1);
					const color = src32[py * srcW + px];
					pixels.push(color);
					sumR += color & 0xff;
					sumG += (color >> 8) & 0xff;
					sumB += (color >> 16) & 0xff;
					sumA += (color >> 24) & 0xff;
				}
			}

			const avgAll =
				(Math.round(sumA / pixels.length) << 24) |
				(Math.round(sumB / pixels.length) << 16) |
				(Math.round(sumG / pixels.length) << 8) |
				Math.round(sumR / pixels.length);

			// Find max contrast pair (Optimized Candidates Approach)
			// O(N) scan instead of O(N^2) exhaustive
			let p1 = pixels[0];
			let p2 = pixels[0];
			let maxPairDist = -1;

			if (pixels.length > 0) {
				// 1. Identify candidates (Min/Max for each channel + Luma)
				let minR = 255,
					maxR = 0,
					minR_idx = 0,
					maxR_idx = 0;
				let minG = 255,
					maxG = 0,
					minG_idx = 0,
					maxG_idx = 0;
				let minB = 255,
					maxB = 0,
					minB_idx = 0,
					maxB_idx = 0;
				let minL = 255,
					maxL = 0,
					minL_idx = 0,
					maxL_idx = 0;

				for (let i = 0; i < pixels.length; i++) {
					const c = pixels[i];
					const r = c & 0xff;
					const g = (c >> 8) & 0xff;
					const b = (c >> 16) & 0xff;
					const l = 0.299 * r + 0.587 * g + 0.114 * b;

					if (r < minR) {
						minR = r;
						minR_idx = i;
					}
					if (r > maxR) {
						maxR = r;
						maxR_idx = i;
					}
					if (g < minG) {
						minG = g;
						minG_idx = i;
					}
					if (g > maxG) {
						maxG = g;
						maxG_idx = i;
					}
					if (b < minB) {
						minB = b;
						minB_idx = i;
					}
					if (b > maxB) {
						maxB = b;
						maxB_idx = i;
					}
					if (l < minL) {
						minL = l;
						minL_idx = i;
					}
					if (l > maxL) {
						maxL = l;
						maxL_idx = i;
					}
				}

				// 2. Collection unique candidates
				const candIndices = new Set([
					minR_idx,
					maxR_idx,
					minG_idx,
					maxG_idx,
					minB_idx,
					maxB_idx,
					minL_idx,
					maxL_idx,
				]);
				const uniqueCandidates = Array.from(candIndices).map((i) => pixels[i]);

				// 3. Exhaustive check on small set of candidates (max 8x8 = 64 comparisons)
				for (let i = 0; i < uniqueCandidates.length; i++) {
					for (let j = i + 1; j < uniqueCandidates.length; j++) {
						const d = getColorDistSq(uniqueCandidates[i], uniqueCandidates[j]);
						if (d > maxPairDist) {
							maxPairDist = d;
							p1 = uniqueCandidates[i];
							p2 = uniqueCandidates[j];
						}
					}
				}
			}

			// Deterministic HC color selection (Pick darker)
			let hcColor = p1;
			const l1 = getLuma(p1),
				l2 = getLuma(p2);
			if (Math.abs(l1 - l2) > 1) {
				hcColor = l1 < l2 ? p1 : p2;
			} else {
				// Tie-break by occurrence
				let c1 = 0,
					c2 = 0;
				for (const p of pixels) {
					if (p === p1) c1++;
					if (p === p2) c2++;
				}
				hcColor = c1 >= c2 ? p1 : p2;
			}

			const hcMask = new Uint8Array(pixels.length);
			let hcCount = 0;
			for (let i = 0; i < pixels.length; i++) {
				if (getColorDistSq(pixels[i], hcColor) < similarityThresholdSq) {
					hcMask[i] = 1;
					hcCount++;
				}
			}

			let bgR = 0,
				bgG = 0,
				bgB = 0,
				bgA = 0,
				bgCount = 0;
			for (let i = 0; i < pixels.length; i++) {
				if (hcMask[i] === 0) {
					bgR += pixels[i] & 0xff;
					bgG += (pixels[i] >> 8) & 0xff;
					bgB += (pixels[i] >> 16) & 0xff;
					bgA += (pixels[i] >> 24) & 0xff;
					bgCount++;
				}
			}

			const avgWithoutHC =
				bgCount > 0
					? (Math.round(bgA / bgCount) << 24) |
						(Math.round(bgB / bgCount) << 16) |
						(Math.round(bgG / bgCount) << 8) |
						Math.round(bgR / bgCount)
					: avgAll;

			grid[ty * targetW + tx] = {
				avgAll,
				hcColor,
				hcCount,
				avgWithoutHC,
				state: CellState.Unresolved,
				fillColor: hcColor,
				maxContrast: maxPairDist,
				hcPixels: new Map(),
			};
		}
	}

	const isHC = (tx: number, ty: number, sx: number, sy: number) => {
		if (tx < 0 || tx >= targetW || ty < 0 || ty >= targetH) return false;
		if (sx < 0 || sx >= E || sy < 0 || sy >= E) return false;
		const sp = grid[ty * targetW + tx];

		// Need to check if this pixel is HC relative to ITS superpixel's color
		const xStartBoundary = tx * E;
		const yStartBoundary = ty * E;
		const px = xStartBoundary + sx;
		const py = yStartBoundary + sy;
		if (px >= srcW || py >= srcH) return false;
		const color = src32[py * srcW + px];
		return getColorDistSq(color, sp.hcColor) < similarityThresholdSq;
	};

	// --- Phase 1: Collect per-HC-pixel connectivity ---
	for (let ty = 0; ty < targetH; ty++) {
		for (let tx = 0; tx < targetW; tx++) {
			const sp = grid[ty * targetW + tx];
			for (let sy = 0; sy < E; sy++) {
				for (let sx = 0; sx < E; sx++) {
					if (!isHC(tx, ty, sx, sy)) continue;

					const isEdge = sx === 0 || sx === E - 1 || sy === 0 || sy === E - 1;
					// Center only exists if E is odd (e.g. E=3 -> (1,1))
					const isCenter =
						E % 2 === 1 && sx === (E - 1) / 2 && sy === (E - 1) / 2;

					let nIntra = 0;
					let nInter = 0;

					// Check 4 neighbors
					// N
					let ntx = tx,
						nty = ty,
						nsx = sx,
						nsy = sy - 1;
					if (nsy < 0) {
						nty--;
						nsy = E - 1;
					}
					if (isHC(ntx, nty, nsx, nsy)) {
						if (ntx === tx && nty === ty) nIntra++;
						else nInter++;
					}

					// S
					ntx = tx;
					nty = ty;
					nsx = sx;
					nsy = sy + 1;
					if (nsy >= E) {
						nty++;
						nsy = 0;
					}
					if (isHC(ntx, nty, nsx, nsy)) {
						if (ntx === tx && nty === ty) nIntra++;
						else nInter++;
					}

					// E
					ntx = tx;
					nty = ty;
					nsx = sx + 1;
					nsy = sy;
					if (nsx >= E) {
						ntx++;
						nsx = 0;
					}
					if (isHC(ntx, nty, nsx, nsy)) {
						if (ntx === tx && nty === ty) nIntra++;
						else nInter++;
					}

					// W
					ntx = tx;
					nty = ty;
					nsx = sx - 1;
					nsy = sy;
					if (nsx < 0) {
						ntx--;
						nsx = E - 1;
					}
					if (isHC(ntx, nty, nsx, nsy)) {
						if (ntx === tx && nty === ty) nIntra++;
						else nInter++;
					}

					sp.hcPixels.set(sy * E + sx, {
						isEdge,
						isCenter,
						nIntra,
						nInter,
					});
				}
			}
		}
	}
	const phase0 = options?.debugContrastAware ? captureSourceDebug() : undefined;

	// --- Phase 2: Fill rules (Priority hierarchy) ---
	for (let i = 0; i < grid.length; i++) {
		const sp = grid[i];

		// Rule A: hcCount >= E
		if (sp.hcCount >= E) {
			sp.state = CellState.FilledHC;
			sp.fillColor = sp.hcColor;
			continue;
		}

		// Rule B: hcCount == 0
		if (sp.hcCount === 0) {
			sp.state = CellState.FilledAvg;
			sp.fillColor = sp.avgAll;
			continue;
		}

		// Rule C: 0 < hcCount < E
		if (sp.hcCount > 0 && sp.hcCount < E) {
			let promoted = false;

			for (const [_pxIdx, info] of sp.hcPixels) {
				const nTotal = info.nIntra + info.nInter;

				// Condition C1: Edge pixel
				if (info.isEdge) {
					if (nTotal >= 2 && info.nInter >= 1) {
						promoted = true;
						break;
					}
				}
				// Condition C2: Center pixel (E=3 special case)
				else if (E === 3 && info.isCenter) {
					if (info.nIntra >= 2) {
						promoted = true;
						break;
					}
				}
				// Normal (non-edge, non-center or E!=3 center logic fallback)
				else {
					if (nTotal >= 2) {
						promoted = true;
						break;
					}
				}
			}

			if (promoted) {
				sp.state = CellState.FilledHC;
				sp.fillColor = sp.hcColor;
			} else {
				// Not promoted - check fallbacks
				// Logic: "if hcCount == 1 and ... < 2: avgNoHC"
				// Note: if count==1, there is only 1 pixel p.
				if (sp.hcCount === 1) {
					const info = Array.from(sp.hcPixels.values())[0];
					const nTotal = info.nIntra + info.nInter;
					if (nTotal < 2) {
						sp.state = CellState.Underfilled; // OLD: FilledAvgNoHC. NEW: Don't erase!
						// sp.fillColor = sp.avgWithoutHC;
					} else {
						sp.state = CellState.Underfilled;
					}
				} else {
					sp.state = CellState.Underfilled;
				}
			}
		}
	}
	const phase1 = options?.debugContrastAware ? captureSourceDebug() : undefined;
	const phase2 = options?.debugContrastAware ? captureSourceDebug() : undefined;

	// --- Phase 3: Rule E (Pairwise Resolution among underfilled) ---
	const claimed = new Uint8Array(grid.length);
	const simThresholdSq =
		COLOR_SIMILARITY_THRESHOLD * COLOR_SIMILARITY_THRESHOLD;

	for (let ty = 0; ty < targetH; ty++) {
		for (let tx = 0; tx < targetW; tx++) {
			const idx = ty * targetW + tx;
			const sp = grid[idx];
			if (sp.state !== CellState.Underfilled || claimed[idx]) continue;

			// 1. Find adjacent underfilled superpixels (N, E, S, W order for stability)
			const candidates = [
				ty > 0 ? idx - targetW : -1, // N
				tx < targetW - 1 ? idx + 1 : -1, // E
				ty < targetH - 1 ? idx + targetW : -1, // S
				tx > 0 ? idx - 1 : -1, // W
			];

			let pairIdx = -1;
			for (const nid of candidates) {
				if (
					nid !== -1 &&
					grid[nid].state === CellState.Underfilled &&
					!claimed[nid]
				) {
					// Check if they are HC-similar (approximate)
					if (getColorDistSq(sp.hcColor, grid[nid].hcColor) < simThresholdSq) {
						pairIdx = nid;
						break;
					}
				}
			}

			if (pairIdx === -1) {
				// No underfilled adjacent exists -> conservative default
				sp.state = CellState.FilledAvgNoHC;
				sp.fillColor = sp.avgWithoutHC;
				claimed[idx] = 1;
			} else {
				// Pairwise resolution: Choose EXACTLY ONE winner
				const other = grid[pairIdx];
				let spWins = false;

				// 1. Higher hcCount
				if (sp.hcCount > other.hcCount) spWins = true;
				else if (sp.hcCount < other.hcCount) spWins = false;
				else {
					// 2. Higher maxContrast
					if (sp.maxContrast > other.maxContrast) spWins = true;
					else if (sp.maxContrast < other.maxContrast) spWins = false;
					else {
						// 3. Lower luminance (darker wins)
						const l1 = getLuma(sp.hcColor);
						const l2 = getLuma(other.hcColor);
						if (l1 < l2) spWins = true;
						else if (l1 > l2) spWins = false;
						else {
							// 4. Stable tie-breaker: smaller index
							spWins = idx < pairIdx;
						}
					}
				}

				if (spWins) {
					sp.state = CellState.FilledHC;
					sp.fillColor = sp.hcColor;
					other.state = CellState.FilledAvgNoHC;
					other.fillColor = other.avgWithoutHC;
				} else {
					sp.state = CellState.FilledAvgNoHC;
					sp.fillColor = sp.avgWithoutHC;
					other.state = CellState.FilledHC;
					other.fillColor = other.hcColor;
				}

				claimed[idx] = 1;
				claimed[pairIdx] = 1;
			}
		}
	}
	const phase3 = options?.debugContrastAware ? captureSourceDebug() : undefined;

	// Final Rendering
	for (let i = 0; i < grid.length; i++) {
		out32[i] = grid[i].fillColor;
	}

	return {
		result: { data: outData, width: targetW, height: targetH },
		phase0,
		phase1,
		phase2,
		phase3,
	};
};
