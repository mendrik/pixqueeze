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

export interface DeblurWorkerApi {
	applyBilateral(imageData: ImageData, strength: number): Promise<ImageData>;
	applyWavelet(
		imageData: ImageData,
		strength: number,
		clamp: number,
	): Promise<ImageData>;
}
