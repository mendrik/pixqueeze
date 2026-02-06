export interface PaletteColor {
	r: number;
	g: number;
	b: number;
}

export type DeblurMethod = "none" | "wavelet" | "bilateral";

export interface ScalingOptions {
	superpixelThreshold?: number;
	bilateralStrength?: number;
	waveletStrength?: number;
	deblurMethod?: DeblurMethod;
	maxColorsPerShade?: number;
	overlayContours?: boolean;
	onProgress?: (p: number) => void;
}

export interface RawImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;
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

export interface ScalerWorkerApi {
	processNearest: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
	processBicubic: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;

	processPaletteArea: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		palette: PaletteColor[],
		options?: ScalingOptions,
	) => Promise<RawImageData>;
	processEdgePriority: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		threshold: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;

	processSharpener: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		threshold: number,
		bilateralStrength: number,
		waveletStrength: number,
		deblurMethod: DeblurMethod,
		maxColorsPerShade: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;

	extractPalette: (
		input: RawImageData | ImageBitmap,
		maxColors: number,
	) => Promise<PaletteColor[]>;
	processContourDebug: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
	) => Promise<{
		contour: RawImageData;
		highPass: RawImageData;
		threshold: RawImageData;
	}>;
	processContrastAware: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		threshold: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
}
