import * as Comlink from "comlink";
import {
	phase0DebugResultStore,
	phase1DebugResultStore,
	phase2DebugResultStore,
	phase3DebugResultStore,
} from "../store";
import type {
	RawImageData,
	ScalerWorkerApi,
	ScalingAlgorithm,
	ScalingOptions,
} from "../types";

/** Superpixel scaling that preserves high-contrast features to avoid pollution. */
export const ContrastAwareScaler: ScalingAlgorithm = {
	name: "Contrast Aware",
	id: "contrast-aware",
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
			await import("../workers/scaler.worker?worker")
		).default();
		const api = Comlink.wrap<ScalerWorkerApi>(workerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

			const res = await api.processContrastAware(
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
				{ ...workerOptions, debugContrastAware: true },
			);

			const rawData = res.result;

			const toDataURL = (raw: RawImageData) => {
				const c = document.createElement("canvas");
				c.width = raw.width;
				c.height = raw.height;
				const ctx = c.getContext("2d");
				if (!ctx) return null;
				// Rebuild a fresh ArrayBuffer no matter what the worker returned
				const arrayBuffer = new ArrayBuffer(raw.data.byteLength);
				new Uint8Array(arrayBuffer).set(new Uint8Array(raw.data.buffer));
				const safeData = new Uint8ClampedArray(arrayBuffer);
				const imgData = new ImageData(safeData, raw.width, raw.height);
				ctx.putImageData(imgData, 0, 0);
				return c.toDataURL();
			};

			if (res.phase0) phase0DebugResultStore.set(toDataURL(res.phase0));
			if (res.phase1) phase1DebugResultStore.set(toDataURL(res.phase1));
			if (res.phase2) phase2DebugResultStore.set(toDataURL(res.phase2));
			if (res.phase3) phase3DebugResultStore.set(toDataURL(res.phase3));

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
