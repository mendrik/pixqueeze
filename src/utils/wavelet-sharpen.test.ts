import { describe, expect, it } from "vitest";
import { applyWaveletSharpen } from "./wavelet-sharpen";

// Polyfill ImageData if missing (e.g. in basic jsdom environment without canvas)
if (typeof ImageData === "undefined") {
	global.ImageData = class ImageData {
		data: Uint8ClampedArray;
		width: number;
		height: number;
		colorSpace: PredefinedColorSpace;
		constructor(data: Uint8ClampedArray, width: number, height: number) {
			this.data = data;
			this.width = width;
			this.height = height;
			this.colorSpace = "srgb";
		}
		// biome-ignore lint/suspicious/noExplicitAny: Polyfill
	} as any;
}

describe("applyWaveletSharpen", () => {
	it("should return an ImageData object", () => {
		const width = 10;
		const height = 10;
		const data = new Uint8ClampedArray(width * height * 4);
		// Fill with gray
		data.fill(128);
		const input = new ImageData(data, width, height);

		const result = applyWaveletSharpen(input, 0.5, 0.1);
		expect(result).toBeInstanceOf(ImageData);
		expect(result.width).toBe(width);
		expect(result.height).toBe(height);
	});

	it("should sharpen an edge", () => {
		// 4x1 image: Dark | Light | Light | Dark
		// 0, 100, 100, 0
		const w = 4;
		const h = 1;
		const data = new Uint8ClampedArray(w * h * 4);

		// Pixel 0: 50
		data[0] = 50;
		data[1] = 50;
		data[2] = 50;
		data[3] = 255;
		// Pixel 1: 200
		data[4] = 200;
		data[5] = 200;
		data[6] = 200;
		data[7] = 255;
		// Pixel 2: 200
		data[8] = 200;
		data[9] = 200;
		data[10] = 200;
		data[11] = 255;
		// Pixel 3: 50
		data[12] = 50;
		data[13] = 50;
		data[14] = 50;
		data[15] = 255;

		const input = new ImageData(data, w, h);

		// With sharpening, the transition should be enhanced if detail logic works.
		// L0: 50, 200, 200, 50
		// Blur:
		// P0: (50 + 2*50 + 200)/4 = 350/4 = 87.5
		// Detail0: 50 - 87.5 = -37.5
		// Boost: -37.5 * gain.
		// Input is u8, processed as float 0..1.
		// Let's just check raw values change.

		const result = applyWaveletSharpen(input, 1.0, 0.2);

		// Check pixel 0 red channel
		const p0 = result.data[0];

		// Expect modification
		expect(p0).not.toBe(50);
	});

	it("should preserve alpha", () => {
		const w = 2;
		const h = 2;
		const len = w * h * 4;
		const data = new Uint8ClampedArray(len).fill(0);
		// Set some alphas
		data[3] = 128;
		data[7] = 255;

		const input = new ImageData(data, w, h);
		const result = applyWaveletSharpen(input, 0.5, 0.1);

		expect(result.data[3]).toBe(128); // Should assume alpha preservation
		expect(result.data[7]).toBe(255);
	});
});
