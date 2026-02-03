import { describe, expect, it } from "vitest";
import { extractPalette, findClosestColor, optimizePalette } from "./palette";

// Mock ImageData for Node environment
class MockImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	colorSpace: PredefinedColorSpace = "srgb";

	constructor(data: Uint8ClampedArray, width: number, height: number) {
		this.data = data;
		this.width = width;
		this.height = height;
	}
}
// biome-ignore lint/suspicious/noExplicitAny: Mock
globalThis.ImageData = MockImageData as any; // Polyfill for jsdom

describe("Palette Utils", () => {
	it("extracts unique colors ignoring alpha 0", () => {
		const width = 2;
		const height = 2;
		// 4 pixels: red, red, green, transparent
		const data = new Uint8ClampedArray([
			255,
			0,
			0,
			255, // Red
			255,
			0,
			0,
			255, // Red
			0,
			255,
			0,
			255, // Green
			0,
			0,
			255,
			0, // Transparent (blue but alpha 0)
		]);
		const imageData = new ImageData(data, width, height);

		const palette = extractPalette(imageData);
		expect(palette).toHaveLength(2);
		expect(palette).toContainEqual({ r: 255, g: 0, b: 0 });
		expect(palette).toContainEqual({ r: 0, g: 255, b: 0 });
	});

	it("optimizes palette by merging close colors", () => {
		const palette = [
			{ r: 0, g: 0, b: 0 },
			{ r: 2, g: 2, b: 2 }, // Very close to black
			{ r: 100, g: 100, b: 100 }, // Far away
		];

		// Distance sq between (0,0,0) and (2,2,2) is 4+4+4 = 12.
		// Sqrt(12) is ~3.46.
		// Threshold 5 means 5*5 = 25. 12 < 25, so they merge.

		const optimized = optimizePalette(palette, 5);
		expect(optimized).toHaveLength(2);
		// Expect merged color: (0+2)/2 = 1
		expect(optimized).toContainEqual({ r: 1, g: 1, b: 1 });
		expect(optimized).toContainEqual({ r: 100, g: 100, b: 100 });
	});

	it("finds closest color", () => {
		const palette = [
			{ r: 0, g: 0, b: 0 },
			{ r: 255, g: 255, b: 255 },
		];

		const darkGray = { r: 10, g: 10, b: 10 };
		const lightGray = { r: 200, g: 200, b: 200 };

		expect(findClosestColor(darkGray, palette)).toEqual({ r: 0, g: 0, b: 0 });
		expect(findClosestColor(lightGray, palette)).toEqual({
			r: 255,
			g: 255,
			b: 255,
		});
	});
});
