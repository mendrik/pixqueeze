import { describe, it, expect } from "vitest";
import { processContrastAwareBase } from "./scalers/contrast-aware";

// Define RawImageData type if not imported, or import from types if possible
// Assuming simple structure for testing
interface RawImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

describe("ContrastAwareScaler Perf & Hang", () => {
	// Generate a noise image to stress test
	const createNoiseImage = (w: number, h: number): RawImageData => {
		const data = new Uint8ClampedArray(w * h * 4);
		for (let i = 0; i < data.length; i++) {
			data[i] = Math.floor(Math.random() * 256);
			if ((i + 1) % 4 === 0) data[i] = 255; // Alpha
		}
		return { data, width: w, height: h };
	};

	it("should complete a 100x100 to 10x10 scaling without hanging (10x Downscale)", () => {
		const srcW = 100;
		const srcH = 100;
		const targetW = 10;
		const targetH = 10;
		const input = createNoiseImage(srcW, srcH);

		const start = performance.now();
		const result = processContrastAwareBase(input, targetW, targetH, 0); // threshold param is ignored
		const end = performance.now();

		console.log(`Processing time: ${end - start}ms`);
		expect(result).toBeDefined();
		expect(result.result.width).toBe(targetW);
		expect(result.result.height).toBe(targetH);
	});

	it("should complete a 100x100 to 200x200 scaling (Upscale) without hanging", () => {
		const srcW = 100;
		const srcH = 100;
		const targetW = 200;
		const targetH = 200;
		const input = createNoiseImage(srcW, srcH);

		const start = performance.now();
		// This tests the E=1 clamp
		const result = processContrastAwareBase(input, targetW, targetH, 0);
		const end = performance.now();

		console.log(`Upscale Processing time: ${end - start}ms`);
		expect(result).toBeDefined();
		// E should be 1
	});

	it("should handle small non-integer ratios gracefully", () => {
		const srcW = 105;
		const srcH = 105;
		const targetW = 10;
		const targetH = 10;
		const input = createNoiseImage(srcW, srcH);

		const result = processContrastAwareBase(input, targetW, targetH, 0);
		expect(result).toBeDefined();
	});
});
