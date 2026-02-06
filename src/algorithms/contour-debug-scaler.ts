import { wrap } from "comlink";
import {
	contourDebugResultStore,
	highPassDebugResultStore,
	thresholdDebugResultStore,
} from "../store";
import type { ScalerWorkerApi, ScalingAlgorithm } from "../types";
import ScalerWorker from "../workers/scaler.worker?worker";

const worker = wrap<ScalerWorkerApi>(new ScalerWorker());

export const ContourDebugScaler: ScalingAlgorithm = {
	name: "Contour Debug",
	id: "contour-debug",
	process: async (image, targetW, targetH, _options) => {
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas context failed");
		ctx.drawImage(image, 0, 0);
		const imageData = ctx.getImageData(0, 0, image.width, image.height);

		const result = await worker.processContourDebug(
			{
				data: imageData.data,
				width: imageData.width,
				height: imageData.height,
			},
			targetW,
			targetH,
		);

		const toDataURL = (raw: typeof result.contour) => {
			const outCanvas = document.createElement("canvas");
			outCanvas.width = raw.width;
			outCanvas.height = raw.height;
			const outCtx = outCanvas.getContext("2d");
			if (!outCtx) return "";

			const outImgData = new ImageData(
				// biome-ignore lint/suspicious/noExplicitAny: ImageData constructor mismatch fix
				raw.data as any,
				raw.width,
				raw.height,
			);
			outCtx.putImageData(outImgData, 0, 0);
			return outCanvas.toDataURL("image/png");
		};

		const contourUrl = toDataURL(result.contour);
		const highPassUrl = toDataURL(result.highPass);
		const thresholdUrl = toDataURL(result.threshold);

		// We need to import the stores to set them.
		// Since this is a regular module, we can import stores.
		// However, to avoid circular dependencies if stores import algorithms (unlikely but possible),
		// let's check imports. `contour-debug-scaler.ts` imports types. `store.ts` imports types.
		// It should be fine.

		// Wait, I need to import the stores. I'll add the import in a separate tool call if needed,
		// or use dynamic import if I can't see the top of the file right now (I saw it earlier, it only imports from types and worker).

		// Update stores with side-effect results
		highPassDebugResultStore.set(highPassUrl);
		thresholdDebugResultStore.set(thresholdUrl);
		contourDebugResultStore.set(contourUrl);

		return contourUrl; // Main result
	},
};
