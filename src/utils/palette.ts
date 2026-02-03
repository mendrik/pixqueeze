export type RGB = { r: number; g: number; b: number };

/**
 * Extracts a palette of unique colors from the given ImageData.
 * Ignores fully transparent pixels.
 */
export function extractPalette(imageData: ImageData): RGB[] {
	const { data, width, height } = imageData;
	const palette: RGB[] = [];
	const seen = new Set<string>();

	for (let i = 0; i < width * height; i++) {
		const idx = i * 4;
		const r = data[idx];
		const g = data[idx + 1];
		const b = data[idx + 2];
		const a = data[idx + 3];

		if (a === 0) continue; // Ignore transparency

		const key = `${r},${g},${b}`;
		if (!seen.has(key)) {
			seen.add(key);
			palette.push({ r, g, b });
		}
	}

	return palette;
}

/**
 * Calculates the Euclidean distance squared between two colors.
 */
function colorDistSq(c1: RGB, c2: RGB): number {
	const dr = c1.r - c2.r;
	const dg = c1.g - c2.g;
	const db = c1.b - c2.b;
	return dr * dr + dg * dg + db * db;
}

/**
 * Optimizes a palette by merging colors that are indistinguishable
 * (closer than the given threshold distance).
 *
 * This implementation uses a simple greedy approach:
 * 1. Take the first color.
 * 2. Find all other colors close to it.
 * 3. Average them all into one color.
 * 4. Add to new palette and remove from processing.
 * 5. Repeat.
 */
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

		// Average the group
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

/**
 * Finds the closest color in the palette to the target color.
 */
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

/**
 * Iteratively optimizes the palette until it has at most the target number of colors.
 */
export function reducePaletteToCount(
	palette: RGB[],
	targetCount: number,
): RGB[] {
	if (palette.length <= targetCount) return palette;

	let currentPalette = [...palette];
	let threshold = 2; // Start with a small threshold

	// Heuristic loop: increase threshold until we reach target count
	// Safety break to prevent infinite loops (though reduce should eventually effectively merge everything)
	let lastLength = currentPalette.length;
	let sameLengthCount = 0;

	while (currentPalette.length > targetCount) {
		currentPalette = optimizePalette(currentPalette, threshold);
		threshold += 5; // Increase step

		if (currentPalette.length === lastLength) {
			sameLengthCount++;
		} else {
			sameLengthCount = 0;
		}
		lastLength = currentPalette.length;

		// If we're stuck, force a larger jump or break if we simply can't reduce further (unlikely with optimizePalette)
		if (sameLengthCount > 5) {
			threshold += 20;
		}
		if (threshold > 500) break; // Maximum reasonable color distance
	}

	// If we still have too many (e.g. very distinct colors), just slice the most distinct?
	// But optimizePalette should tend to merge.
	// As a final fallback if strictly needed:
	if (currentPalette.length > targetCount) {
		// Just take the first N (this is arbitrary but safe)
		currentPalette = currentPalette.slice(0, targetCount);
	}

	return currentPalette;
}
