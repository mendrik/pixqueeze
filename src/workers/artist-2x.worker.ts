import { expose } from "comlink";
import { processArtist2x } from "./scalers/artist-2x";
import { ensureRawImageData } from "./utils";
import type { RawImageData, ScalingOptions } from "../types";

const api = {
	processArtist2x: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData | { result: RawImageData; debugPhases: any }> => {
		// Note: The return type is expanded to handle debug info
		// Artist 2x ignores targetW/targetH for calculation, but we keep signature compatible if needed.

		const rawInput = await ensureRawImageData(input);
		const { result, phase0, phase1, phase2, phase3 } = processArtist2x(
			rawInput,
			targetW,
			targetH,
			0, // _threshold unused
			options,
		);

		if (options?.debugContrastAware) {
			return {
				result,
				debugPhases: { phase0, phase1, phase2, phase3 },
			} as any;
		}

		return result;
	},
};

expose(api);
export type Artist2xWorkerApi = typeof api;
