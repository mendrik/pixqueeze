import * as Comlink from "comlink";
import {
	applyBilateralFilter,
	applyUnsharpMask,
} from "../utils/bilateral-filter";
import { applyWaveletSharpen } from "../utils/wavelet-sharpen";

const api = {
	applyBilateral(imageData: ImageData, strength: number): ImageData {
		console.log("[Worker] applying Bilateral Filter");
		// Apply bilateral filter for edge-preserving smoothing
		const filtered = applyBilateralFilter(imageData, strength);
		// Follow with subtle unsharp mask for crispness
		return applyUnsharpMask(filtered, strength * 0.5);
	},

	applyWavelet(
		imageData: ImageData,
		strength: number,
		clamp: number,
	): ImageData {
		console.log(
			`[Worker] applyWavelet called. Strength: ${strength}, Clamp: ${clamp}`,
		);
		try {
			const result = applyWaveletSharpen(imageData, strength, clamp);
			console.log("[Worker] applyWavelet success");
			return result;
		} catch (e) {
			console.error("[Worker] applyWavelet failed:", e);
			throw e;
		}
	},
};

Comlink.expose(api);
