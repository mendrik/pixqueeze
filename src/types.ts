export interface ScalingAlgorithm {
	name: string;
	id: string;
	process: (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		// biome-ignore lint/suspicious/noExplicitAny: Algorithm options vary dynamically
		options?: { onProgress?: (percent: number) => void; [key: string]: any },
	) => Promise<string>;
}

export interface PaletteColor {
	r: number;
	g: number;
	b: number;
	count?: number;
}

export interface RawImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface DeblurWorkerApi {
	applyBilateral(
		imageData: RawImageData,
		strength: number,
	): Promise<RawImageData>;
	applyWavelet(
		imageData: RawImageData,
		strength: number,
		clamp: number,
	): Promise<RawImageData>;
}

export interface ScalerWorkerApi {
	processNearest(
		input: ImageBitmap,
		targetW: number,
		targetH: number,
	): Promise<RawImageData>;

	processBicubic(
		input: ImageBitmap,
		targetW: number,
		targetH: number,
	): Promise<RawImageData>;

	processContour(
		input: {
			data: Uint8ClampedArray;
			width: number;
			height: number;
		},
		targetW: number,
		targetH: number,
		threshold: number,
	): Promise<RawImageData>;

	processSharpener(
		input: {
			data: Uint8ClampedArray;
			width: number;
			height: number;
		},
		targetW: number,
		targetH: number,
		threshold: number,
		bilateralStrength: number,
		waveletStrength: number,
		deblurMethod: "none" | "bilateral" | "wavelet",
		maxColorsPerShade: number,
	): Promise<RawImageData>;

	processPaletteArea(
		input: {
			data: Uint8ClampedArray;
			width: number;
			height: number;
		},
		targetW: number,
		targetH: number,
		palette: PaletteColor[],
	): Promise<RawImageData>;
}
