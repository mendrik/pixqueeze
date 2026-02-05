import * as Comlink from "comlink";
import type { ScalerWorkerApi, ScalingAlgorithm } from "../types";

/** Grid-constrained scored-growth superpixel downscaling. */
export const ContourScaler: ScalingAlgorithm = {
	name: "Contour Scaler",
	id: "contour-scaler",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: unknown,
	): Promise<string> => {
		const opt = options as { superpixelThreshold?: number };
		const threshold = opt?.superpixelThreshold ?? 35;

		const srcW = image.naturalWidth;
		const srcH = image.naturalHeight;

		const srcCanvas = document.createElement("canvas");
		srcCanvas.width = srcW;
		srcCanvas.height = srcH;
		const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
		if (!srcCtx) throw new Error("Source canvas context unavailable");
		srcCtx.drawImage(image, 0, 0);
		const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

		const workerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			const rawData = await api.processContour(
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
