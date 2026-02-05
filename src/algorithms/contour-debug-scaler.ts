import { wrap } from "comlink";
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
			targetW, // We might want to use native size for debug, but following interface
			targetH,
		);

		const outCanvas = document.createElement("canvas");
		outCanvas.width = result.width;
		outCanvas.height = result.height;
		const outCtx = outCanvas.getContext("2d");
		if (!outCtx) throw new Error("Output context failed");

		const outImgData = new ImageData(
			// biome-ignore lint/suspicious/noExplicitAny: ImageData constructor mismatch fix
			result.data as any,
			result.width,
			result.height,
		);
		outCtx.putImageData(outImgData, 0, 0);

		return outCanvas.toDataURL("image/png");
	},
};
