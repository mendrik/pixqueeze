import * as Comlink from "comlink";
import type { ScalerWorkerApi, ScalingAlgorithm } from "../types";

export const BicubicScaler: ScalingAlgorithm = {
	name: "Bicubic",
	id: "bicubic",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
	): Promise<string> => {
		const bitmap = await createImageBitmap(image);

		const workerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			const rawData = await api.processBicubic(
				Comlink.transfer(bitmap, [bitmap]),
				targetW,
				targetH,
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
