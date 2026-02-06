import * as Comlink from "comlink";
import type { RawImageData, ScalerWorkerApi } from "../types";

const rawToUrl = (raw: RawImageData): string => {
	const canvas = document.createElement("canvas");
	canvas.width = raw.width;
	canvas.height = raw.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas context failed");

	// Reconstruct Uint8ClampedArray
	const arrayBuffer = new ArrayBuffer(raw.data.byteLength);
	new Uint8Array(arrayBuffer).set(new Uint8Array(raw.data.buffer));
	const safeData = new Uint8ClampedArray(arrayBuffer);

	const imgData = new ImageData(safeData, raw.width, raw.height);
	ctx.putImageData(imgData, 0, 0);
	return canvas.toDataURL();
};

export const ContourDebugScaler = {
	name: "Contour Debug",
	id: "contour-debug",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
	): Promise<{ contour: string; highPass: string; threshold: string }> => {
		const bitmap = await createImageBitmap(image);

		const workerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			const result = await api.processContourDebug(
				Comlink.transfer(bitmap, [bitmap]),
				targetW,
				targetH,
			);

			return {
				contour: rawToUrl(result.contour),
				highPass: rawToUrl(result.highPass),
				threshold: rawToUrl(result.threshold),
			};
		} finally {
			workerInstance.terminate();
		}
	},
};
