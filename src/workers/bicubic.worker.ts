/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processBicubic } from "./scalers/bicubic";
import { ensureRawImageData } from "./utils";
import { applyContourOverlay } from "./utils/contour";

const api = {
	processBicubic: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);

		// processBicubic expects ImageBitmap.
		let bitmap: ImageBitmap;
		if (input instanceof ImageBitmap) {
			bitmap = input;
		} else {
			bitmap = await createImageBitmap(
				new ImageData(rawInput.data as any, rawInput.width, rawInput.height),
			);
		}

		const result = processBicubic(bitmap, targetW, targetH);

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
export type BicubicWorkerApi = typeof api;
