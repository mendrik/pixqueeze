import * as Comlink from "comlink";
import type {
	EdgePriorityWorkerApi,
	ScalingAlgorithm,
	ScalingOptions,
} from "../types";

/** Grid-constrained scored-growth edge-priority superpixel downscaling. */
export const EdgePriorityScaler: ScalingAlgorithm = {
	name: "Edge Priority Scaler",
	id: "edge-priority-scaler",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<string> => {
		const threshold = options?.superpixelThreshold ?? 35;

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
			await import("../workers/edge-priority.worker?worker")
		).default();
		const api = Comlink.wrap<EdgePriorityWorkerApi>(workerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

			const rawData = await api.processEdgePriority(
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
				},
			);

			const canvas = document.createElement("canvas");
			canvas.width = targetW;
			canvas.height = targetH;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Output canvas context unavailable");

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
