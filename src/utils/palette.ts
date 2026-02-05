export type RGB = { r: number; g: number; b: number; count?: number };

/** Extracts unique non-transparent colors. */
export function extractPalette(imageData: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}): RGB[] {
	const { data, width, height } = imageData;
	const counts = new Map<number, number>();
	const data32 = new Uint32Array(data.buffer);
	const len = width * height;

	for (let i = 0; i < len; i++) {
		const val = data32[i];
		const a = (val >> 24) & 0xff;

		if (a === 0) continue;

		const rgb = val & 0xffffff;
		counts.set(rgb, (counts.get(rgb) || 0) + 1);
	}

	const palette: RGB[] = [];
	for (const [rgb, count] of counts.entries()) {
		palette.push({
			r: rgb & 0xff,
			g: (rgb >> 8) & 0xff,
			b: (rgb >> 16) & 0xff,
			count,
		});
	}

	return palette;
}

/** Squared Euclidean distance. */
function colorDistSq(c1: RGB, c2: RGB): number {
	const dr = c1.r - c2.r;
	const dg = c1.g - c2.g;
	const db = c1.b - c2.b;
	return dr * dr + dg * dg + db * db;
}

/** Merges indistinguishable colors. */
export function optimizePalette(palette: RGB[], threshold: number): RGB[] {
	const optimized: RGB[] = [];
	const remaining = [...palette];
	const thresholdSq = threshold * threshold;

	while (remaining.length > 0) {
		const base = remaining.shift();
		if (!base) break;
		const group: RGB[] = [base];
		const nextRemaining: RGB[] = [];

		for (const color of remaining) {
			if (colorDistSq(base, color) <= thresholdSq) {
				group.push(color);
			} else {
				nextRemaining.push(color);
			}
		}

		let accR = 0;
		let accG = 0;
		let accB = 0;
		for (const c of group) {
			accR += c.r;
			accG += c.g;
			accB += c.b;
		}
		const count = group.length;
		optimized.push({
			r: Math.round(accR / count),
			g: Math.round(accG / count),
			b: Math.round(accB / count),
		});

		remaining.length = 0;
		remaining.push(...nextRemaining);
	}

	return optimized;
}

/** Finds the closest palette color. */
export function findClosestColor(color: RGB, palette: RGB[]): RGB {
	if (palette.length === 0) return color;

	let minDistSq = Number.POSITIVE_INFINITY;
	let closest = palette[0];

	for (const p of palette) {
		const distSq = colorDistSq(color, p);
		if (distSq < minDistSq) {
			minDistSq = distSq;
			closest = p;
		}
	}

	return closest;
}

/** Reduces palette to at most the target count. */
export function reducePaletteToCount(
	palette: RGB[],
	targetCount: number,
): RGB[] {
	if (palette.length <= targetCount) return palette;

	let currentPalette = [...palette];
	let threshold = 2;
	let lastLength = currentPalette.length;
	let sameLengthCount = 0;

	while (currentPalette.length > targetCount) {
		currentPalette = optimizePalette(currentPalette, threshold);
		threshold += 5;

		if (currentPalette.length === lastLength) {
			sameLengthCount++;
		} else {
			sameLengthCount = 0;
		}
		lastLength = currentPalette.length;

		if (sameLengthCount > 5) {
			threshold += 20;
		}
		if (threshold > 500) break;
	}

	if (currentPalette.length > targetCount) {
		currentPalette = currentPalette.slice(0, targetCount);
	}

	return currentPalette;
}
