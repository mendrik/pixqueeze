import * as Comlink from "comlink";
import type { PaletteColor, RawImageData, ScalerWorkerApi } from "../types";

// Worker setup

const processMegapixel = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	targetW: number,
	targetH: number,
	threshold: number,
	palette: PaletteColor[],
): ImageData => {
	const srcW = input.width;
	const srcH = input.height;
	const srcData = input.data;
	const srcData32 = new Uint32Array(srcData.buffer);

	const visited = new Uint8Array(srcW * srcH);
	const outData = new Uint8ClampedArray(targetW * targetH * 4);
	const outData32 = new Uint32Array(outData.buffer);

	// Pre-extract palette as Uint32 for faster snapping
	const palette32 = new Uint32Array(palette.length);
	for (let i = 0; i < palette.length; i++) {
		const p = palette[i];
		palette32[i] = (255 << 24) | (p.b << 16) | (p.g << 8) | p.r;
	}

	// Priority queue for growth - simple max-heap implementation to avoid objects
	// We'll use two arrays to act as a heap of { index, score }
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

	// Neighbors cache
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

			// Step 1: Find best seed in cell
			for (let cy = cellMinY; cy <= cellMaxY; cy++) {
				for (let cx = cellMinX; cx <= cellMaxX; cx++) {
					const idx = cy * srcW + cx;
					const val = srcData32[idx];
					// Alpha check
					if (((val >> 24) & 0xff) < 25) continue;

					// Inlined contrast check
					let sumDiff = 0;
					let nCount = 0;
					const r = val & 0xff;
					const g = (val >> 8) & 0xff;
					const b = (val >> 16) & 0xff;
					const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

					for (let ni = -1; ni <= 1; ni++) {
						for (let nj = -1; nj <= 1; nj++) {
							if (ni === 0 && nj === 0) continue;
							const nx = cx + ni;
							const ny = cy + nj;
							if (nx >= 0 && nx < srcW && ny >= 0 && ny < srcH) {
								const nVal = srcData32[ny * srcW + nx];
								const nr = nVal & 0xff;
								const ng = (nVal >> 8) & 0xff;
								const nb = (nVal >> 16) & 0xff;
								const nLum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
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

			// Step 2: Regional growth
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

			heapSize = 0; // Reset heap
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

						// Inlined contrast for neighbor
						let nSumDiff = 0;
						let nNCount = 0;
						for (let ni = -1; ni <= 1; ni++) {
							for (let nj = -1; nj <= 1; nj++) {
								if (ni === 0 && nj === 0) continue;
								const nnx = nx + ni;
								const nny = ny + nj;
								if (nnx >= 0 && nnx < srcW && nny >= 0 && nny < srcH) {
									const nnVal = srcData32[nny * srcW + nnx];
									const nnr = nnVal & 0xff;
									const nng = (nnVal >> 8) & 0xff;
									const nnb = (nnVal >> 16) & 0xff;
									nSumDiff += Math.abs(
										0.2126 * nnr + 0.7152 * nng + 0.0722 * nnb - nLum * 255,
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

			// Clean up remaining in cell
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

			// Snapping and output
			if (a < 25) {
				outData32[ty * targetW + tx] = 0;
			} else {
				// Find closest in palette
				let minDist = 1000000;
				let bestColor = palette32[0];
				for (let i = 0; i < palette32.length; i++) {
					const pc = palette32[i];
					const pr = pc & 0xff;
					const pg = (pc >> 8) & 0xff;
					const pb = (pc >> 16) & 0xff;
					const dr = r - pr;
					const dg = g - pg;
					const db = b - pb;
					const dist = dr * dr + dg * dg + db * db;
					if (dist < minDist) {
						minDist = dist;
						bestColor = pc;
					}
				}
				outData32[ty * targetW + tx] = (a << 24) | (bestColor & 0xffffff);
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Raw object return
	return { data: outData, width: targetW, height: targetH } as any;
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
	// Count buffer for majority vote: palette index -> weight
	// To avoid creating a Map for every pixel, we can use a recycled Float32 or Int32 array
	// if the palette size is small. Assuming palette < 256 or similar.
	// But palette can be large. Let's stick to a dense array if palette is reasonably small (<1024), otherwise Map.
	// Most pixel art palettes are small.
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
						// Safe check for bounds, though pIdx should be within palette length
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

	// biome-ignore lint/suspicious/noExplicitAny: Raw object return
	return { data: outData, width: targetW, height: targetH } as any;
};

const api: ScalerWorkerApi = {
	processMegapixel: async (input, targetW, targetH, threshold, palette) => {
		const result = processMegapixel(
			input,
			targetW,
			targetH,
			threshold,
			palette,
		);
		// biome-ignore lint/suspicious/noExplicitAny: Transfer handling
		return Comlink.transfer(result, [result.data.buffer]) as any;
	},
	processPaletteArea: async (input, targetW, targetH, palette) => {
		const result = processPaletteArea(input, targetW, targetH, palette);
		// biome-ignore lint/suspicious/noExplicitAny: Transfer handling
		return Comlink.transfer(result, [result.data.buffer]) as any;
	},
};

Comlink.expose(api);
