/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processSharpener } from "./scalers/sharpener";
import { ensureRawImageData } from "./utils";

const api = {
	processSharpener: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);
		return processSharpener(
			rawInput,
			targetW,
			targetH,
			options?.deblurMethod || "none",
			options?.bilateralStrength || 0,
			options?.waveletStrength || 0,
			options?.maxColorsPerShade || 0,
		);
	},
};

expose(api);
// Export type for the client
export type SharpenerWorkerApi = typeof api;
