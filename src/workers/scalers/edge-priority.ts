import type { RawImageData } from "../../types";

export const processEdgePriorityBase = (
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
