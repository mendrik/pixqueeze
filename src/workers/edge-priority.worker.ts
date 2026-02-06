/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processEdgePriorityBase } from "./scalers/edge-priority";
import { ensureRawImageData } from "./utils";

const api = {
	processEdgePriority: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	): Promise<RawImageData> => {
		const rawInput = await ensureRawImageData(input);
		return processEdgePriorityBase(
			rawInput,
			targetW,
			targetH,
			options?.superpixelThreshold || 10,
		);
	},
};

expose(api);
export type EdgePriorityWorkerApi = typeof api;
