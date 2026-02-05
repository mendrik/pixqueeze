// Domain Types
export type DeblurMethod = "none" | "bilateral" | "wavelet";

export interface ScalingOptions {
	onProgress?: (percent: number) => void;
	[key: string]: unknown;
}

export interface ScalingAlgorithm {
	name: string;
	id: string;
	process: (
		image: HTMLImageElement,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<string>;
}

export interface PaletteColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly count?: number;
}

export interface RawImageData {
	readonly data: Uint8ClampedArray;
	readonly width: number;
	readonly height: number;
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

	processEdgePriority(
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
		deblurMethod: DeblurMethod,
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

	processContourDebug(
		input: {
			data: Uint8ClampedArray;
			width: number;
			height: number;
		},
		targetW: number,
		targetH: number,
	): Promise<RawImageData>;
}
