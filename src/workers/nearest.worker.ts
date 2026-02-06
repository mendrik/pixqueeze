/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processNearest } from "./scalers/nearest";
import { ensureRawImageData } from "./utils";
import { applyContourOverlay } from "./utils/contour";

const api = {
	processNearest: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);
		// Nearest scaler logic (using ImageBitmap for performance if possible, but processNearest currently takes ImageBitmap)
		// Wait, processNearest in scalers/nearest.ts (Step 434) takes ImageBitmap.
		// ensureRawImageData returns RawImageData.
		// We need to convert back or update processNearest to accept RawImageData?
		// processNearest uses OffscreenCanvas. It needs ImageBitmap or something drawable. RawImageData (struct) is not drawable directly.
		// I should check `src/workers/scalers/nearest.ts` again. It takes `srcBitmap: ImageBitmap`.
		// So I need to construct an ImageBitmap from rawInput.

		let bitmap: ImageBitmap;
		if (input instanceof ImageBitmap) {
			bitmap = input;
		} else {
			bitmap = await createImageBitmap(
				new ImageData(rawInput.data as any, rawInput.width, rawInput.height),
			);
		}

		const result = processNearest(bitmap, targetW, targetH);

		let finalResult = result;

		if (options?.overlayContours) {
			finalResult = applyContourOverlay(result, rawInput);
		}

		if (!(input instanceof ImageBitmap)) {
			bitmap.close();
		}

		return finalResult;
	},
};

expose(api);
export type NearestWorkerApi = typeof api;
