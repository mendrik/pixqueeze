import * as Comlink from "comlink";
import type {
	DeblurMethod,
	ScalingAlgorithm,
	ScalingOptions,
	SharpenerWorkerApi,
} from "../types";

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
		options?: ScalingOptions,
	): Promise<string> => {
		const threshold = (options?.superpixelThreshold as number) ?? 35;
		const deblurMethod = (options?.deblurMethod as DeblurMethod) ?? "none";
		const bilateralStrength = (options?.bilateralStrength as number) ?? 0;
		const waveletStrength = (options?.waveletStrength as number) ?? 0.5;
		const maxColorsPerShade = (options?.maxColorsPerShade as number) ?? 4;

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
			await import("../workers/sharpener.worker?worker")
		).default();
		const api = Comlink.wrap<SharpenerWorkerApi>(workerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

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
				{
					...workerOptions,
					superpixelThreshold: threshold,
					deblurMethod,
					bilateralStrength,
					waveletStrength,
					maxColorsPerShade,
				},
			);

			const canvas = document.createElement("canvas");
			canvas.width = targetW;
			canvas.height = targetH;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Output canvas context unavailable");

			// rawData.data is already Uint8ClampedArray from the worker transfer
			// Rebuild a fresh ArrayBuffer no matter what the worker returned
			const arrayBuffer = new ArrayBuffer(rawData.data.byteLength);
			new Uint8Array(arrayBuffer).set(new Uint8Array(rawData.data.buffer));
			const safeData = new Uint8ClampedArray(arrayBuffer);

			const imgData = new ImageData(safeData, targetW, targetH);
			ctx.putImageData(imgData, 0, 0);
			return canvas.toDataURL();
		} finally {
			workerInstance.terminate();
		}
	},
};
