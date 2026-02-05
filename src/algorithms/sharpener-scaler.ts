import * as Comlink from "comlink";
import type { ScalerWorkerApi, ScalingAlgorithm } from "../types";

/**
 * Sharpener Scaler
 * Extends Edge Priority Scaler by snapping final colors to a
 * palette extracted and optimized from the source image.
 * Applies optional sharpening and De-AA.
 */
export const SharpenerScaler: ScalingAlgorithm = {
	name: "Sharpener",
	id: "sharpener",

	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: unknown,
	): Promise<string> => {
		const opt = options as {
			superpixelThreshold?: number;
			bilateralStrength?: number;
			waveletStrength?: number;
			deblurMethod?: "none" | "bilateral" | "wavelet";
			onProgress?: (percent: number) => void;
			maxColorsPerShade?: number;
		};
		const threshold = opt?.superpixelThreshold ?? 35;
		const deblurMethod = opt?.deblurMethod ?? "none";
		const bilateralStrength = opt?.bilateralStrength ?? 0;
		const waveletStrength = opt?.waveletStrength ?? 0.5;
		const maxColorsPerShade = opt?.maxColorsPerShade ?? 4;

		const srcW = image.naturalWidth;
		const srcH = image.naturalHeight;

		const srcCanvas = document.createElement("canvas");
		srcCanvas.width = srcW;
		srcCanvas.height = srcH;
		const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
		if (!srcCtx) throw new Error("Source canvas context unavailable");
		srcCtx.drawImage(image, 0, 0);
		const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
		const srcData = srcImageData.data;

		const workerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			const rawData = await api.processSharpener(
				Comlink.transfer(
					{
						data: srcData,
						width: srcW,
						height: srcH,
					},
					[srcData.buffer],
				),
				targetW,
				targetH,
				threshold,
				bilateralStrength,
				waveletStrength,
				deblurMethod as "none" | "bilateral" | "wavelet",
				maxColorsPerShade,
			);

			const canvas = document.createElement("canvas");
			canvas.width = targetW;
			canvas.height = targetH;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Output canvas context unavailable");

			// @ts-expect-error: TS definition mismatch for ImageData
			const imgData = new ImageData(rawData.data, targetW, targetH);
			ctx.putImageData(imgData, 0, 0);
			return canvas.toDataURL();
		} finally {
			workerInstance.terminate();
		}
	},
};
