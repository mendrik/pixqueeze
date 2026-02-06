import type { RawImageData } from "../../types";
import { applySeparableGaussianBlur } from "../utils";

const HP_SIGMA = 0.5;
const HP_CONTRAST = 12.0; // Increased from 5.0

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
				if (candidates[idx - 1] === 1 && candidates[idx + 1] === 1) {
					bridged[idx] = 1;
				} else if (candidates[idx - w] === 1 && candidates[idx + w] === 1) {
					bridged[idx] = 1;
				} else if (
					candidates[idx - w - 1] === 1 &&
					candidates[idx + w + 1] === 1
				) {
					bridged[idx] = 1;
				} else if (
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

const computeEdgeMap = (
	input: RawImageData,
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

	// 3. Autotuned Local Threshold
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
	const radius = 3; // Reduced from 5 for tighter local mean

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = y * w + x;
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

			// Even more aggressive threshold
			if (hpf[idx] < localMean - globalDeviation * 0.4) {
				candidates[idx] = 1;
			}
		}
	}

	// 3.5 Noise Removal
	const visitedNoise = new Uint8Array(w * h);
	const noiseStack: number[] = [];
	const cluster: number[] = [];
	const MIN_CLUSTER_SIZE = 3; // Reduced from 5

	for (let i = 0; i < w * h; i++) {
		if (candidates[i] === 1 && visitedNoise[i] === 0) {
			noiseStack.push(i);
			cluster.length = 0;
			visitedNoise[i] = 1;
			while (noiseStack.length > 0) {
				const curr = noiseStack.pop();
				if (curr === undefined) break; // Should not happen
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

	return bridgeEdges(candidates, w, h);
};

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
	destCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);

	return destCtx.getImageData(0, 0, targetW, targetH).data;
};

export const applyContourOverlay = (
	target: RawImageData,
	source: RawImageData,
): RawImageData => {
	// 1. Detect Mask
	const mask = computeEdgeMap(source, HP_SIGMA, HP_CONTRAST);
	const srcW = source.width;
	const srcH = source.height;
	const srcData32 = new Uint32Array(source.data.buffer);

	// 2. Create Contour Layer (Full RGBA)
	const contourLayer = new Uint8ClampedArray(srcW * srcH * 4);
	const contourData32 = new Uint32Array(contourLayer.buffer);

	for (let i = 0; i < mask.length; i++) {
		if (mask[i] === 1) {
			contourData32[i] = srcData32[i];
		} else {
			contourData32[i] = 0;
		}
	}

	// 3. Scale Contour Layer
	const scaledContour = scaleLayerBicubic(
		contourLayer,
		srcW,
		srcH,
		target.width,
		target.height,
	);

	// 4. Composite (Darken Only)
	const targetData = target.data;
	const len = targetData.length;

	// Create a copy to minimize side effects on input if shared?
	// But valid to modify in place for workers usually.
	// Let's modify in place to match previous logic (superimposeContour was void)
	// But we return it for the API.

	for (let i = 0; i < len; i += 4) {
		const rS = scaledContour[i];
		const gS = scaledContour[i + 1];
		const bS = scaledContour[i + 2];
		const aS = scaledContour[i + 3] / 255.0;

		if (aS <= 0.05) continue;

		const rD = targetData[i];
		const gD = targetData[i + 1];
		const bD = targetData[i + 2];

		const rDark = Math.min(rD, rS);
		const gDark = Math.min(gD, gS);
		const bDark = Math.min(bD, bS);

		targetData[i] = rDark * aS + rD * (1.0 - aS);
		targetData[i + 1] = gDark * aS + gD * (1.0 - aS);
		targetData[i + 2] = bDark * aS + bD * (1.0 - aS);
	}

	return {
		data: targetData,
		width: target.width,
		height: target.height,
	};
};
