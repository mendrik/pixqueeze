import type { RawImageData } from "../../types";

export const processBicubic = (
	srcBitmap: ImageBitmap,
	targetW: number,
	targetH: number,
): RawImageData => {
	const canvas = new OffscreenCanvas(targetW, targetH);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Offscreen context failed");
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(srcBitmap, 0, 0, targetW, targetH);
	const data = ctx.getImageData(0, 0, targetW, targetH);
	return {
		data: data.data,
		width: targetW,
		height: targetH,
	};
};
