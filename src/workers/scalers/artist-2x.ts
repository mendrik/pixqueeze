import type { RawImageData, ScalingOptions } from "../../types";

// Artist 2x: A dedicated 2x downscaler optimized for pixel art.
// Forces 2x2 superpixels regardless of input target dimensions.

export const processArtist2x = (
	input: { data: Uint8ClampedArray; width: number; height: number },
	_requestedW: number,
	_requestedH: number,
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

	// Force 2x downscaling
	const targetW = Math.floor(srcW / 2);
	const targetH = Math.floor(srcH / 2);
	const outData = new Uint8ClampedArray(targetW * targetH * 4);
	const out32 = new Uint32Array(outData.buffer);

	const E = 2; // Always 2x2 blocks
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
		const ty = Math.floor(i / targetW);
		const tx = i % targetW;

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

			for (const [pxIdx, info] of sp.hcPixels) {
				const nTotal = info.nIntra + info.nInter;

				// Condition C1: Edge pixel
				if (info.isEdge) {
					// Recalculate 'effective' nInter: only count neighbors that are ALREADY FilledHC (or guaranteed to be)
					// This prevents staircase boundaries from expanding into uncertain territory.
					let effectiveNInter = 0;

					// Recover local coordinates (sx, sy) from pxIdx (flat index 0..E*E-1)
					const sy = Math.floor(pxIdx / E);
					const sx = pxIdx % E;

					// Neighbors to check (N, S, E, W) - same order as Phase 1 helps, but logic is independent
					const neighbors = [
						{ dx: 0, dy: -1 }, // N
						{ dx: 0, dy: 1 }, // S
						{ dx: 1, dy: 0 }, // E
						{ dx: -1, dy: 0 }, // W
					];

					for (const { dx, dy } of neighbors) {
						let ntx = tx;
						let nty = ty;
						let nsx = sx + dx;
						let nsy = sy + dy;

						// Handle boundary crossing to find neighbor superpixel coords
						if (nsx < 0) {
							ntx--;
							nsx = E - 1;
						} else if (nsx >= E) {
							ntx++;
							nsx = 0;
						}
						if (nsy < 0) {
							nty--;
							nsy = E - 1;
						} else if (nsy >= E) {
							nty++;
							nsy = 0;
						}

						// Check if valid neighbor
						if (isHC(ntx, nty, nsx, nsy)) {
							// Determine if it is Inter or Intra
							if (ntx !== tx || nty !== ty) {
								// Inter-superpixel neighbor. Check its state.
								const nidx = nty * targetW + ntx;
								const nsp = grid[nidx];

								// Criterion: Must be "FilledHC" (already visited/set) OR "Guaranteed to be FilledHC" (hcCount >= E)
								if (nsp.state === CellState.FilledHC || nsp.hcCount >= E) {
									effectiveNInter++;
								}
							}
						}
					}

					if (info.nIntra + effectiveNInter >= 2 && effectiveNInter >= 1) {
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
