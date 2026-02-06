/// <reference lib="webworker" />
import { expose } from "comlink";
import { processContrastAwareBase } from "./scalers/contrast-aware";
import { ensureRawImageData } from "./utils";
import type { RawImageData, ScalingOptions } from "../types";

const api = {
	processContrastAware: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData | { result: RawImageData; debugPhases: any }> => {
		// Note: The return type is expanded to handle debug info

		const rawInput = await ensureRawImageData(input);
		const { result, phase0, phase1, phase2, phase3 } = processContrastAwareBase(
			rawInput,
			targetW,
			targetH,
			0, // _threshold unused
			options,
		);

		if (options?.debugContrastAware) {
			return {
				...result,
				debugPhases: { phase0, phase1, phase2, phase3 },
			} as any;
		}

		return result;
	},
};

expose(api);
export type ContrastAwareWorkerApi = typeof api;
