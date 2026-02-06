import * as Comlink from "comlink";
import type {
	ScalerWorkerApi,
	ScalingAlgorithm,
	ScalingOptions,
} from "../types";

export const BicubicScaler: ScalingAlgorithm = {
	name: "Bicubic",
	id: "bicubic",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<string> => {
		const bitmap = await createImageBitmap(image);

		const workerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

			const rawData = await api.processBicubic(
				Comlink.transfer(bitmap, [bitmap]),
				targetW,
				targetH,
				workerOptions,
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
