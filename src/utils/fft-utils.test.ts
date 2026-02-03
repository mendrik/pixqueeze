// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyHighFrequencyBoost } from "./fft-utils";

if (typeof ImageData === "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: Polyfill
	(globalThis as any).ImageData = class ImageData {
		data: Uint8ClampedArray;
		width: number;
		height: number;
		constructor(data: Uint8ClampedArray, width: number, height: number) {
			this.data = data;
			this.width = width;
			this.height = height;
		}
	};
}

describe("FFT Utils", () => {
	it("should return identical image when strength is 0", () => {
		const width = 10;
		const height = 10;
		const data = new Uint8ClampedArray(width * height * 4).fill(100);
		const input = new ImageData(data, width, height);

		const result = applyHighFrequencyBoost(input, 0);

		expect(result.data).toEqual(input.data);
	});

	it("should modify image when strength is > 0", () => {
		const width = 4;
		const height = 4;
		const data = new Uint8ClampedArray(width * height * 4).fill(0);
		// Create a center dot to see impulse response / ringing
		const centerIdx = (2 * width + 2) * 4;
		data[centerIdx] = 200; // R
		data[centerIdx + 1] = 200; // G
		data[centerIdx + 2] = 200; // B
		data[centerIdx + 3] = 255; // A

		const input = new ImageData(data, width, height);

		const result = applyHighFrequencyBoost(input, 1.0);

		// The center pixel might change (likely increase or decrease depending on filter normalization),
		// but neighbors should definitely change due to ringing/sharpening spreading.
		// Actually pure sharpening amplifies differences. A single dot against black is max difference.
		// It might boost the dot further or create negative lobes around it (which become 0 due to clamping).

		// Let's just check that it's NOT identical.
		expect(result.data).not.toEqual(input.data);

		// Also checks dimensions match
		expect(result.width).toBe(width);
		expect(result.height).toBe(height);
	});
});
