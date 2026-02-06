/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processEdgePriorityBase } from "./scalers/edge-priority";
import { ensureRawImageData } from "./utils";
import { applyContourOverlay } from "./utils/contour";

const api = {
	processEdgePriority: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);
		const result = processEdgePriorityBase(
			rawInput,
			targetW,
			targetH,
			options?.superpixelThreshold || 10,
		);

		if (options?.overlayContours) {
			return applyContourOverlay(result, rawInput);
		}

		return result;
	},
};

expose(api);
export type EdgePriorityWorkerApi = typeof api;
