import * as Comlink from "comlink";
import type {
	DeblurWorkerApi,
	RawImageData,
	ScalerWorkerApi,
} from "../../types";
import { extractPalette, findClosestColor } from "../../utils/palette";
import { ALPHA_MIN } from "../../utils/pixel-logic";
import DeblurWorker from "../../workers/deblur.worker?worker";

/** Core megapixel scaler logic. */
export const processMegapixelToImageData = async (
	image: HTMLImageElement,
	targetW: number,
	targetH: number,
	threshold = 35,
	bilateralStrength = 0,
	waveletStrength = 0.25,
	deblurMethod: "none" | "bilateral" | "wavelet" = "wavelet",
	_onProgress?: (p: number) => void,
): Promise<ImageData> => {
	const srcW = image.naturalWidth;
	const srcH = image.naturalHeight;

	const srcCanvas = document.createElement("canvas");
	srcCanvas.width = srcW;
	srcCanvas.height = srcH;
	const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
	if (!srcCtx) throw new Error("Source canvas context unavailable");
	srcCtx.imageSmoothingEnabled = false;
	srcCtx.drawImage(image, 0, 0);
	const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
	const srcData = srcImageData.data;

	const rawPalette = extractPalette(srcImageData);

	const palette = rawPalette;

	// Worker setup
	const scalerWorkerInstance = new (
		await import("../../workers/scaler.worker?worker")
	).default();
	const scalerWorkerApi = Comlink.wrap<ScalerWorkerApi>(scalerWorkerInstance);

	let outImage: RawImageData;
	try {
		// Transfer source data to worker
		outImage = await scalerWorkerApi.processMegapixel(
			Comlink.transfer(
				{
					data: srcData,
					width: srcW,
					height: srcH,
				},
				[srcData.buffer],
			),
			targetW,
			targetH,
			threshold,
			palette,
		);
	} finally {
		scalerWorkerInstance.terminate();
	}

	let processedImage = outImage;

	if (deblurMethod !== "none") {
		const workerInstance = new DeblurWorker();
		const workerApi = Comlink.wrap<DeblurWorkerApi>(workerInstance);

		try {
			if (deblurMethod === "bilateral" && bilateralStrength > 0) {
				processedImage = await workerApi.applyBilateral(
					Comlink.transfer(processedImage, [processedImage.data.buffer]),
					bilateralStrength,
				);
			} else if (deblurMethod === "wavelet") {
				processedImage = await workerApi.applyWavelet(
					Comlink.transfer(processedImage, [processedImage.data.buffer]),
					waveletStrength,
					0.1,
				);
			}
		} catch (e) {
			console.error("[Megapixel] Worker execution failed:", e);
		} finally {
			workerInstance.terminate();
		}
	}

	const finalData = processedImage.data;
	for (let i = 0; i < finalData.length; i += 4) {
		const a = finalData[i + 3];
		if (a <= ALPHA_MIN) {
			finalData[i] = 0;
			finalData[i + 1] = 0;
			finalData[i + 2] = 0;
			finalData[i + 3] = 0;
		} else {
			const snapped = findClosestColor(
				{ r: finalData[i], g: finalData[i + 1], b: finalData[i + 2] },
				palette,
			);
			finalData[i] = snapped.r;
			finalData[i + 1] = snapped.g;
			finalData[i + 2] = snapped.b;
		}
	}

	// @ts-expect-error: TS definition mismatch for Uint8ClampedArray
	return new ImageData(
		processedImage.data,
		processedImage.width,
		processedImage.height,
	);
};
