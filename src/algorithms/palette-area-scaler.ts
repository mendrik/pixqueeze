import type { ScalingAlgorithm } from "../types";
import { extractPalette } from "../utils/palette";

/**
 * Palette-Aware Area Sampling (Best Quality)
 *
 * Pipeline:
 * 1. Convert image to indexed/palette form
 * 2. Area-sample in palette space
 * 3. Re-quantize using majority or weighted vote
 */
export const PaletteAreaScaler: ScalingAlgorithm = {
	name: "Palette-Aware Area sampling",
	id: "palette-area",
	process: (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
	): Promise<string> => {
		const srcW = image.naturalWidth;
		const srcH = image.naturalHeight;

		const srcCanvas = document.createElement("canvas");
		srcCanvas.width = srcW;
		srcCanvas.height = srcH;
		const srcCtx = srcCanvas.getContext("2d");
		if (!srcCtx) throw new Error("Source canvas context unavailable");
		srcCtx.drawImage(image, 0, 0);
		const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
		const srcData = srcImageData.data;

		// 1. Extract palette
		const palette = extractPalette(srcImageData);

		// 2. Map source pixels to palette indices for faster lookup
		const indexedPixels = new Int16Array(srcW * srcH); // -1 for transparent
		for (let i = 0; i < srcW * srcH; i++) {
			const idx = i * 4;
			if (srcData[idx + 3] < 128) {
				indexedPixels[i] = -1;
			} else {
				const r = srcData[idx];
				const g = srcData[idx + 1];
				const b = srcData[idx + 2];

				// Find index in palette
				let paletteIdx = -1;
				let minDistSq = Number.POSITIVE_INFINITY;
				for (let p = 0; p < palette.length; p++) {
					const pr = palette[p].r;
					const pg = palette[p].g;
					const pb = palette[p].b;
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

		const outCanvas = document.createElement("canvas");
		outCanvas.width = targetW;
		outCanvas.height = targetH;
		const outCtx = outCanvas.getContext("2d");
		if (!outCtx) throw new Error("Output canvas context unavailable");
		const outImageData = outCtx.createImageData(targetW, targetH);
		const outData = outImageData.data;

		// 3. Area sampling in palette space
		for (let ty = 0; ty < targetH; ty++) {
			for (let tx = 0; tx < targetW; tx++) {
				const startX = (tx * srcW) / targetW;
				const endX = ((tx + 1) * srcW) / targetW;
				const startY = (ty * srcH) / targetH;
				const endY = ((ty + 1) * srcH) / targetH;

				// Majority vote for palette index
				const counts = new Map<number, number>();
				let transparentCount = 0;

				for (let sy = Math.floor(startY); sy < Math.ceil(endY); sy++) {
					for (let sx = Math.floor(startX); sx < Math.ceil(endX); sx++) {
						if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;

						// Calculate overlap of this source pixel with the target pixel area
						const x0 = Math.max(sx, startX);
						const x1 = Math.min(sx + 1, endX);
						const y0 = Math.max(sy, startY);
						const y1 = Math.min(sy + 1, endY);
						const weight = (x1 - x0) * (y1 - y0);

						const pIdx = indexedPixels[sy * srcW + sx];
						if (pIdx === -1) {
							transparentCount += weight;
						} else {
							counts.set(pIdx, (counts.get(pIdx) || 0) + weight);
						}
					}
				}

				let bestIdx = -1;
				let maxWeight = -1;

				for (const [idx, weight] of counts.entries()) {
					if (weight > maxWeight) {
						maxWeight = weight;
						bestIdx = idx;
					}
				}

				const outIdx = (ty * targetW + tx) * 4;
				if (transparentCount > maxWeight || bestIdx === -1) {
					outData[outIdx] = 0;
					outData[outIdx + 1] = 0;
					outData[outIdx + 2] = 0;
					outData[outIdx + 3] = 0;
				} else {
					const color = palette[bestIdx];
					outData[outIdx] = color.r;
					outData[outIdx + 1] = color.g;
					outData[outIdx + 2] = color.b;
					outData[outIdx + 3] = 255;
				}
			}
		}

		outCtx.putImageData(outImageData, 0, 0);
		return Promise.resolve(outCanvas.toDataURL());
	},
};
