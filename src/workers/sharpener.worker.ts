/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processSharpener } from "./scalers/sharpener";
import { ensureRawImageData } from "./utils";
import { applyContourOverlay } from "./utils/contour";

const api = {
	processSharpener: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);
		const result = processSharpener(
			rawInput,
			targetW,
			targetH,
			options?.deblurMethod || "none",
			options?.bilateralStrength || 0,
			options?.waveletStrength || 0,
			options?.maxColorsPerShade || 0,
			options?.superpixelThreshold || 10,
		);

		if (options?.overlayContours) {
			return applyContourOverlay(result, rawInput);
		}

		return result;
	},
};

expose(api);
// Export type for the client
export type SharpenerWorkerApi = typeof api;
