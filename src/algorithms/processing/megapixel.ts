import * as Comlink from "comlink";
import type { DeblurWorkerApi } from "../../types";
import { extractPalette, findClosestColor } from "../../utils/palette";
import {
	ALPHA_MIN,
	forEachNeighbor,
	getLocalContrast,
	luminance01,
	toIndex,
	toPoint,
} from "../../utils/pixel-logic";
// @ts-ignore
import DeblurWorker from "../../workers/deblur.worker?worker";

/**
 * Synchronous core of the megapixel scaler.
 */
export const processMegapixelToImageData = async (
	image: HTMLImageElement,
	targetW: number,
	targetH: number,
	threshold = 35,
	bilateralStrength = 0,
	waveletStrength = 0.5,
	deblurMethod: "none" | "bilateral" | "wavelet" = "none",
	_onProgress?: (p: number) => void,
): Promise<ImageData> => {
	console.log(
		`[Megapixel] Called with deblurMethod: ${deblurMethod}, bilateral: ${bilateralStrength}, wavelet: ${waveletStrength}`,
	);
	const srcW = image.naturalWidth;
	const srcH = image.naturalHeight;

	/* --- Source canvas --- */
	const srcCanvas = document.createElement("canvas");
	srcCanvas.width = srcW;
	srcCanvas.height = srcH;
	const srcCtx = srcCanvas.getContext("2d");
	if (!srcCtx) throw new Error("Source canvas context unavailable");

	srcCtx.drawImage(image, 0, 0);
	const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
	const srcData = srcImageData.data;

	/* --- Feature: Palette Extraction --- */
	// 1. Extract all unique colors
	const rawPalette = extractPalette(srcImageData);

	// 2. Feature: Dynamic Palette Sizing
	// Scale = how much we are shrinking (e.g., 2000px -> 100px => scale 20)
	// Heuristic: The more we shrink, the fewer colors we keep.
	// Formula: Keep Ratio = 0.5 + 0.5 / scale
	const scale = Math.max(1, srcW / targetW);
	const keepRatio = 0.5 + 0.5 / scale;
	const targetPaletteCount = Math.max(
		2,
		Math.floor(rawPalette.length * keepRatio),
	);

	console.log(
		`[Megapixel] Scale: ${scale.toFixed(2)}, Raw Colors: ${rawPalette.length}, Target: ${targetPaletteCount} (${(keepRatio * 100).toFixed(1)}%)`,
	);

	const palette = rawPalette; // reducePaletteToCount(rawPalette, targetPaletteCount);
	console.log(`[Megapixel] Final Palette Size: ${palette.length}`);

	/* --- Bookkeeping & Output --- */
	const visited = new Uint8Array(srcW * srcH);

	const outCanvas = document.createElement("canvas");
	outCanvas.width = targetW;
	outCanvas.height = targetH;
	const outCtx = outCanvas.getContext("2d");
	if (!outCtx) throw new Error("Output canvas context unavailable");
	// Initialize with transparent black
	const outImage = outCtx.createImageData(targetW, targetH);
	const outData = outImage.data;

	/* --- Process each target grid cell --- */
	for (let ty = 0; ty < targetH; ty++) {
		for (let tx = 0; tx < targetW; tx++) {
			const cellMinX = Math.floor((tx * srcW) / targetW);
			const cellMaxX = Math.floor(((tx + 1) * srcW) / targetW) - 1;
			const cellMinY = Math.floor((ty * srcH) / targetH);
			const cellMaxY = Math.floor(((ty + 1) * srcH) / targetH) - 1;

			// 1. Find the best seed pixel in this cell (highest local contrast)
			let seedIdx = -1;
			let maxContrast = -1;

			for (let cy = cellMinY; cy <= cellMaxY; cy++) {
				for (let cx = cellMinX; cx <= cellMaxX; cx++) {
					const idx = toIndex(srcW, cx, cy);
					if (srcData[idx * 4 + 3] <= ALPHA_MIN) continue;

					const contrast = getLocalContrast(srcData, srcW, srcH, idx);
					if (contrast > maxContrast) {
						maxContrast = contrast;
						seedIdx = idx;
					}
				}
			}

			// Fallback if cell is fully transparent or low contrast
			if (seedIdx === -1) {
				seedIdx = toIndex(
					srcW,
					Math.floor(((tx + 0.5) * srcW) / targetW),
					Math.floor(((ty + 0.5) * srcH) / targetH),
				);
			}

			const r0 = srcData[seedIdx * 4];
			const g0 = srcData[seedIdx * 4 + 1];
			const b0 = srcData[seedIdx * 4 + 2];
			const l0 = luminance01(r0, g0, b0);

			const centerPoint = {
				x: (cellMinX + cellMaxX) / 2,
				y: (cellMinY + cellMaxY) / 2,
			};

			let accR = 0;
			let accG = 0;
			let accB = 0;
			let accA = 0;
			let count = 0;

			// 2. Graded growth using a simple priority list (highest score first)
			// Score = similarity * contrast_boost * center_gravity
			const clusterQueue: { idx: number; score: number }[] = [
				{ idx: seedIdx, score: 1000 },
			];

			// Simple iterative growth within the cell
			while (clusterQueue.length > 0) {
				// Pick best candidate
				clusterQueue.sort((a, b) => b.score - a.score);
				const current = clusterQueue.shift();
				if (!current) break;

				if (visited[current.idx]) continue;
				visited[current.idx] = 1;

				const sIdx = current.idx * 4;
				accR += srcData[sIdx];
				accG += srcData[sIdx + 1];
				accB += srcData[sIdx + 2];
				accA += srcData[sIdx + 3];
				count++;

				forEachNeighbor(srcW, srcH, current.idx, 4, (n) => {
					if (visited[n]) return;
					const { x: nx, y: ny } = toPoint(srcW, n);
					if (nx < cellMinX || nx > cellMaxX || ny < cellMinY || ny > cellMaxY)
						return;

					const no = n * 4;
					const dr = Math.abs(srcData[no] - r0);
					const dg = Math.abs(srcData[no + 1] - g0);
					const db = Math.abs(srcData[no + 2] - b0);
					const diff = dr + dg + db;

					if (diff <= threshold) {
						// Calculate sophisticated score
						const nLum = luminance01(
							srcData[no],
							srcData[no + 1],
							srcData[no + 2],
						);
						const colorSimilarity = 1.0 / (0.01 + Math.abs(nLum - l0));
						const contrast = getLocalContrast(srcData, srcW, srcH, n);
						const distToCenter = Math.hypot(
							nx - centerPoint.x,
							ny - centerPoint.y,
						);
						const cogBoost = 1.0 / (0.5 + distToCenter);

						const score = colorSimilarity * (1.0 + contrast * 5.0) * cogBoost;
						clusterQueue.push({ idx: n, score });
					}
				});
			}

			/* --- Fallback: Capture remaining unvisited pixels in target cell --- */
			for (let cy = cellMinY; cy <= cellMaxY; cy++) {
				for (let cx = cellMinX; cx <= cellMaxX; cx++) {
					const cIdx = toIndex(srcW, cx, cy);
					if (visited[cIdx]) continue;

					visited[cIdx] = 1;
					const sIdx = cIdx * 4;
					accR += srcData[sIdx];
					accG += srcData[sIdx + 1];
					accB += srcData[sIdx + 2];
					accA += srcData[sIdx + 3];
					count++;
				}
			}

			// Write result to output image (Intermediate: Average color)
			const o = (ty * targetW + tx) * 4;
			const div = count || 1;
			outData[o] = (accR / div) | 0;
			outData[o + 1] = (accG / div) | 0;
			outData[o + 2] = (accB / div) | 0;
			outData[o + 3] = (accA / div) | 0;
		}
	}

	/* --- Feature: Post-Processing (Bilateral or Maxim) --- */
	let processedImage = outImage;

	if (deblurMethod !== "none") {
		// Instantiate worker
		const workerInstance = new DeblurWorker();
		const workerApi = Comlink.wrap<DeblurWorkerApi>(workerInstance);

		try {
			if (deblurMethod === "bilateral" && bilateralStrength > 0) {
				console.log("[Megapixel] Allocating Worker for Bilateral Filter...");
				processedImage = await workerApi.applyBilateral(
					outImage,
					bilateralStrength,
				);
				console.log("[Megapixel] Bilateral Filter Worker Complete");
			} else if (deblurMethod === "wavelet") {
				console.log("[Megapixel] Allocating Worker for Wavelet Sharpening...");
				processedImage = await workerApi.applyWavelet(
					outImage,
					waveletStrength,
					0.1, // clamp threshold (tuning param)
				);
				console.log("[Megapixel] Wavelet Worker Complete");
			}
		} catch (e) {
			console.error("[Megapixel] Worker execution failed:", e);
		} finally {
			// Cleanup worker
			workerInstance.terminate();
		}
	}

	/* --- Feature: Snap to optimization palette --- */
	const finalData = processedImage.data;
	for (let i = 0; i < finalData.length; i += 4) {
		const a = finalData[i + 3];
		if (a <= ALPHA_MIN) {
			finalData[i] = 0;
			finalData[i + 1] = 0;
			finalData[i + 2] = 0;
			finalData[i + 3] = 0;
		} else {
			const snapped = findClosestColor(
				{ r: finalData[i], g: finalData[i + 1], b: finalData[i + 2] },
				palette,
			);
			finalData[i] = snapped.r;
			finalData[i + 1] = snapped.g;
			finalData[i + 2] = snapped.b;
			// Keep alpha
		}
	}

	return processedImage;
};
