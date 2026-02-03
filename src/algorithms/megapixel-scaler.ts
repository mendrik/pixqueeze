import type { ScalingAlgorithm } from "../types";
import { processMegapixelToImageData } from "./processing/megapixel";

/**
 * Megapixel Scaler
 * Extends Grid Superpixel Smart scaler by snapping final colors to a
 * palette extracted and optimized from the source image.
 */
export const MegapixelScaler: ScalingAlgorithm = {
	name: "Megapixel (Palette Snap)",
	id: "megapixel",

	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: unknown,
	): Promise<string> => {
		const opt = options as {
			superpixelThreshold?: number;
			fftSharpeningStrength?: number;
			deblurMethod?: "none" | "fft" | "bilateral" | "wavelet";
			bilateralStrength?: number;
			waveletStrength?: number;
			onProgress?: (percent: number) => void;
		};
		const threshold = opt?.superpixelThreshold ?? 35;
		const deblurMethod = opt?.deblurMethod ?? "none";
		const bilateralStrength = opt?.bilateralStrength ?? 0;
		const waveletStrength = opt?.waveletStrength ?? 0.5;
		const onProgress = opt?.onProgress;

		const outImageData = await processMegapixelToImageData(
			image,
			targetW,
			targetH,
			threshold,
			bilateralStrength,
			waveletStrength,
			deblurMethod as "none" | "bilateral" | "wavelet",
			onProgress,
		);

		const canvas = document.createElement("canvas");
		canvas.width = targetW;
		canvas.height = targetH;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Output canvas context unavailable");
		ctx.putImageData(outImageData, 0, 0);
		return canvas.toDataURL();
	},
};
