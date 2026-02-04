import * as Comlink from "comlink";
import type { RawImageData } from "../types";
import {
	applyBilateralFilter,
	applyUnsharpMask,
} from "../utils/bilateral-filter";
import { applyWaveletSharpen } from "../utils/wavelet-sharpen";

const api = {
	applyBilateral(imageData: RawImageData, strength: number): RawImageData {
		console.log("[Worker] applying Bilateral Filter");
		// @ts-expect-error: TS definition mismatch in Worker
		const img = new ImageData(
			imageData.data,
			imageData.width,
			imageData.height,
		);
		const filtered = applyBilateralFilter(img, strength);
		const result = applyUnsharpMask(filtered, strength * 0.5);
		const raw: RawImageData = {
			data: result.data,
			width: result.width,
			height: result.height,
		};
		// biome-ignore lint/suspicious/noExplicitAny: Transfer
		return Comlink.transfer(raw, [raw.data.buffer]) as any;
	},

	applyWavelet(
		imageData: RawImageData,
		strength: number,
		clamp: number,
	): RawImageData {
		console.log(
			`[Worker] applyWavelet called. Strength: ${strength}, Clamp: ${clamp}`,
		);
		// @ts-expect-error: TS definition mismatch in Worker
		const img = new ImageData(
			imageData.data,
			imageData.width,
			imageData.height,
		);
		try {
			const result = applyWaveletSharpen(img, strength, clamp);
			console.log("[Worker] applyWavelet success");
			const raw: RawImageData = {
				data: result.data,
				width: result.width,
				height: result.height,
			};
			// biome-ignore lint/suspicious/noExplicitAny: Transfer
			return Comlink.transfer(raw, [raw.data.buffer]) as any;
		} catch (e) {
			console.error("[Worker] applyWavelet failed:", e);
			throw e;
		}
	},
};

Comlink.expose(api);
