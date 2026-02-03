import { describe, expect, it } from "vitest";
import { applyHighPass } from "./high-pass";

const toRgba = (gray01: ReadonlyArray<number>): Uint8ClampedArray => {
	const out = new Uint8ClampedArray(gray01.length * 4);
	for (let i = 0; i < gray01.length; i++) {
		const v = Math.round(Math.min(1, Math.max(0, gray01[i])) * 255);
		out[i * 4] = v;
		out[i * 4 + 1] = v;
		out[i * 4 + 2] = v;
		out[i * 4 + 3] = 255;
	}
	return out;
};

describe("applyHighPass", () => {
	it("outputs neutral gray for a flat image", () => {
		const w = 4;
		const h = 4;
		const data = toRgba(new Array(w * h).fill(0.5));
		const neutralGray = 128 / 255;
		const { highPassRgb01, intensity } = applyHighPass(
			data,
			w,
			h,
			1,
			5,
			"adjust",
		);

		for (let i = 0; i < w * h; i++) {
			expect(highPassRgb01[i * 3]).toBeCloseTo(neutralGray, 6);
			expect(highPassRgb01[i * 3 + 1]).toBeCloseTo(neutralGray, 6);
			expect(highPassRgb01[i * 3 + 2]).toBeCloseTo(neutralGray, 6);
			expect(intensity[i]).toBeCloseTo(0, 6);
		}
	});
});
