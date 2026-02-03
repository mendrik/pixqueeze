export type Point = Readonly<{ x: number; y: number }>;
export type Path = ReadonlyArray<Point>;

export const ALPHA_MIN = 25;

export const clamp = (v: number, min: number, max: number): number => {
	if (!Number.isFinite(v)) return min;
	return Math.max(min, Math.min(max, v));
};

export const toIndex = (w: number, x: number, y: number): number => y * w + x;

export const toPoint = (w: number, idx: number): Point => ({
	x: idx % w,
	y: Math.floor(idx / w),
});

export const luminance01 = (r: number, g: number, b: number): number =>
	(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export const getPixelLum = (data: Uint8ClampedArray, idx: number): number => {
	const o = idx * 4;
	return luminance01(data[o], data[o + 1], data[o + 2]);
};

export const neighborDeltas4: ReadonlyArray<Readonly<[number, number]>> = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

export const neighborDeltas8: ReadonlyArray<Readonly<[number, number]>> = [
	...neighborDeltas4,
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

export const neighbors = (
	w: number,
	h: number,
	idx: number,
	connectivity: 4 | 8,
): number[] => {
	const x = idx % w;
	const y = (idx / w) | 0;
	const deltas = connectivity === 8 ? neighborDeltas8 : neighborDeltas4;
	const result: number[] = [];

	for (let i = 0; i < deltas.length; i++) {
		const d = deltas[i];
		const nx = x + d[0];
		const ny = y + d[1];
		if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
			result.push(ny * w + nx);
		}
	}
	return result;
};

export const forEachNeighbor = (
	w: number,
	h: number,
	idx: number,
	connectivity: 4 | 8,
	callback: (idx: number) => void,
): void => {
	const x = idx % w;
	const y = (idx / w) | 0;
	const deltas = connectivity === 8 ? neighborDeltas8 : neighborDeltas4;

	for (let i = 0; i < deltas.length; i++) {
		const d = deltas[i];
		const nx = x + d[0];
		const ny = y + d[1];
		if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
			callback(ny * w + nx);
		}
	}
};

export const getLocalContrast = (
	data: Uint8ClampedArray,
	w: number,
	h: number,
	idx: number,
): number => {
	const lum = getPixelLum(data, idx);
	const ns = neighbors(w, h, idx, 8);
	let sumDiff = 0;
	if (ns.length > 0) {
		for (let i = 0; i < ns.length; i++) {
			sumDiff += Math.abs(getPixelLum(data, ns[i]) - lum);
		}
	}
	return sumDiff / (ns.length || 1);
};
