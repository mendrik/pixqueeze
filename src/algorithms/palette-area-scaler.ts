import * as Comlink from "comlink";
import type { ScalerWorkerApi, ScalingAlgorithm } from "../types";
import { extractPalette } from "../utils/palette";

/**
 * Palette-Aware Area Sampling (Best Quality)
 *
 * Pipeline:
 * 1. Convert image to indexed/palette form
 * 2. Area-sample in palette space
 * 3. Re-quantize using majority or weighted vote
 */
export const PaletteAreaScaler: ScalingAlgorithm = {
	name: "Palette-Aware",
	id: "palette-area",
	process: async (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: any,
	): Promise<string> => {
		const srcW = image.naturalWidth;
		const srcH = image.naturalHeight;

		const srcCanvas = document.createElement("canvas");
		srcCanvas.width = srcW;
		srcCanvas.height = srcH;
		const srcCtx = srcCanvas.getContext("2d");
		if (!srcCtx) throw new Error("Source canvas context unavailable");
		srcCtx.drawImage(image, 0, 0);
		const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
		const srcData = srcImageData.data;

		// 1. Extract palette
		const palette = extractPalette(srcImageData);

		const outCanvas = document.createElement("canvas");
		outCanvas.width = targetW;
		outCanvas.height = targetH;
		const outCtx = outCanvas.getContext("2d");
		if (!outCtx) throw new Error("Output canvas context unavailable");

		// Worker setup
		const scalerWorkerInstance = new (
			await import("../workers/scaler.worker?worker")
		).default();
		const scalerWorkerApi = Comlink.wrap<ScalerWorkerApi>(scalerWorkerInstance);

		try {
			// Strip non-transferable options
			const { onProgress, ...workerOptions } = options || {};

			const outImage = await scalerWorkerApi.processPaletteArea(
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
				palette,
				workerOptions,
			);

			const arrayBuffer = new ArrayBuffer(outImage.data.byteLength);
			new Uint8Array(arrayBuffer).set(new Uint8Array(outImage.data.buffer));
			const safeData = new Uint8ClampedArray(arrayBuffer);

			const outImageData = new ImageData(
				safeData,
				outImage.width,
				outImage.height,
			);
			outCtx.putImageData(outImageData, 0, 0);
			return outCanvas.toDataURL();
		} finally {
			scalerWorkerInstance.terminate();
		}
	},
};
