/// <reference lib="webworker" />
import { expose } from "comlink";
import type { RawImageData, ScalingOptions } from "../types";
import { processBicubic } from "./scalers/bicubic";

const api = {
	processBicubic: async (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		_options?: ScalingOptions,
	): Promise<RawImageData> => {
		// processBicubic expects ImageBitmap.
		let bitmap: ImageBitmap;
		if (input instanceof ImageBitmap) {
			bitmap = input;
		} else {
			bitmap = await createImageBitmap(
				new ImageData(input.data, input.width, input.height),
			);
		}

		const result = processBicubic(bitmap, targetW, targetH);

		if (!(input instanceof ImageBitmap)) {
			bitmap.close();
		}

		return result;
	},
};

expose(api);
export type BicubicWorkerApi = typeof api;
