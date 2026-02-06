/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processNearest } from "./scalers/nearest";

const api = {
	processNearest: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		_options?: ScalingOptions,
	): Promise<RawImageData> => {
		// Ensure raw data if needed, but nearest might optimize for Bitmap.
		// However, processNearest in nearest.ts takes ImageBitmap.
		// So we should try to pass Bitmap if possible.
		// ensureRawImageData converts TO RawImageData.
		// The original logic passed `input as ImageBitmap` to `processNearest`.
		// Let's look at `processNearest` implementation again if I can...
		// But based on previous file viewing, `processNearest` took `srcBitmap: ImageBitmap`.

		// If input is RawImageData, we must convert it to ImageBitmap for the current nearest implementation.
		let bitmap: ImageBitmap;
		if (input instanceof ImageBitmap) {
			bitmap = input;
		} else {
			bitmap = await createImageBitmap(
				new ImageData(input.data, input.width, input.height),
			);
		}

		const result = processNearest(bitmap, targetW, targetH);

		// If we created the bitmap, we should verify if we need to close it?
		// processNearest doesn't seem to close it.
		// If we passed it in (transfer), the caller owns it (or it's transferred).
		// If we created it from RawImageData, we should probably close it to avoid leaks.
		if (!(input instanceof ImageBitmap)) {
			bitmap.close();
		}

		return result;
	},
};

expose(api);
export type NearestWorkerApi = typeof api;
