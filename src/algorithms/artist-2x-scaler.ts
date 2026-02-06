import * as Comlink from "comlink";
import {
	phase0DebugResultStore,
	phase1DebugResultStore,
	phase2DebugResultStore,
	phase3DebugResultStore,
} from "../store";
import type {
	Artist2xWorkerApi,
	RawImageData,
	ScalingAlgorithm,
	ScalingOptions,
} from "../types";

/** Artist 2x: A dedicated 2x downscaler optimized for pixel art. */
export const Artist2xScaler: ScalingAlgorithm = {
	name: "Artist 2x",
	id: "artist-2x",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<string> => {
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
			await import("../workers/artist-2x.worker?worker")
		).default();
		const api = Comlink.wrap<Artist2xWorkerApi>(workerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

			// We pass targetW/targetH but the worker ignores them for 2x scaling logic.
			const res = await api.processArtist2x(
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
				{ ...workerOptions, debugContrastAware: true },
			);

			// Helper to convert RawImageData to DataURL for debug stores
			const toDataURL = (raw: RawImageData) => {
				const c = document.createElement("canvas");
				c.width = raw.width;
				c.height = raw.height;
				const ctx = c.getContext("2d");
				if (!ctx) return "";
				// Rebuild a fresh ArrayBuffer
				const arrayBuffer = new ArrayBuffer(raw.data.byteLength);
				new Uint8Array(arrayBuffer).set(new Uint8Array(raw.data.buffer));
				const safeData = new Uint8ClampedArray(arrayBuffer);
				const imgData = new ImageData(safeData, raw.width, raw.height);
				ctx.putImageData(imgData, 0, 0);
				return c.toDataURL();
			};

			// Handle union type: could be RawImageData or { result, debugPhases }
			let rawData: RawImageData;

			// Helper to check if it's the extended object
			if ("debugPhases" in res) {
				rawData = res.result;
				const phases = res.debugPhases;
				if (phases) {
					if (phases.phase0)
						phase0DebugResultStore.set(toDataURL(phases.phase0));
					if (phases.phase1)
						phase1DebugResultStore.set(toDataURL(phases.phase1));
					if (phases.phase2)
						phase2DebugResultStore.set(toDataURL(phases.phase2));
					if (phases.phase3)
						phase3DebugResultStore.set(toDataURL(phases.phase3));
				}
			} else {
				rawData = res as RawImageData;
			}

			// Use the actual dimensions returned by the worker (since it forces 2x)
			const finalW = rawData.width;
			const finalH = rawData.height;

			const canvas = document.createElement("canvas");
			canvas.width = finalW;
			canvas.height = finalH;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Output canvas context unavailable");

			// Rebuild a fresh ArrayBuffer no matter what the worker returned
			const arrayBuffer = new ArrayBuffer(rawData.data.byteLength);
			new Uint8Array(arrayBuffer).set(new Uint8Array(rawData.data.buffer));
			const safeData = new Uint8ClampedArray(arrayBuffer);

			const imgData = new ImageData(safeData, finalW, finalH);
			ctx.putImageData(imgData, 0, 0);
			return canvas.toDataURL();
		} finally {
			workerInstance.terminate();
		}
	},
};
