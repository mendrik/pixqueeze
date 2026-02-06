export type DeblurMethod = "none" | "bilateral" | "wavelet";

export interface ScalingOptions {
	// General options
	onProgress?: (progress: number) => void;

	// Edge Priority / Contour Scaler options
	superpixelThreshold?: number;

	// Sharpener options
	deblurMethod?: DeblurMethod;
	bilateralStrength?: number;
	waveletStrength?: number;
	maxColorsPerShade?: number;

	// Contrast Aware options
	debugContrastAware?: boolean;
}

export type PaletteColor = { r: number; g: number; b: number; count: number };

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

// Split Worker APIs for individual workers

export interface NearestWorkerApi {
	processNearest: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
}

export interface BicubicWorkerApi {
	processBicubic: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
}

export interface EdgePriorityWorkerApi {
	processEdgePriority: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
}

export interface SharpenerWorkerApi {
	processSharpener: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<RawImageData>;
}

export interface Artist2xWorkerApi {
	// Updated return type to support debug phases
	processArtist2x: (
		input: RawImageData | ImageBitmap,
		targetW: number,
		targetH: number,
		options?: ScalingOptions,
	) => Promise<
		| RawImageData
		| {
				result: RawImageData;
				debugPhases?: {
					phase0?: RawImageData;
					phase1?: RawImageData;
					phase2?: RawImageData;
					phase3?: RawImageData;
				};
		  }
	>;
}

// Legacy monolithic API (can be removed later or kept for compatibility if needed)
export interface ScalerWorkerApi
	extends NearestWorkerApi,
		BicubicWorkerApi,
		EdgePriorityWorkerApi,
		SharpenerWorkerApi,
		Artist2xWorkerApi {
	// These were in the old monolithic interface but implemented?
	// processPaletteArea // removed from monolithic worker
	// extractPalette // removed from monolithic worker
	// processContourDebug // removed from monolithic worker
}
