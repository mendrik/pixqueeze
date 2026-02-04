import type { ScalingAlgorithm } from "../types";

export const NearestScaler: ScalingAlgorithm = {
	name: "Nearest",
	id: "nearest",
	process: (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
	): Promise<string> => {
		const canvas = document.createElement("canvas");
		canvas.width = targetW;
		canvas.height = targetH;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Output canvas context unavailable");

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(image, 0, 0, targetW, targetH);
		return Promise.resolve(canvas.toDataURL());
	},
};
