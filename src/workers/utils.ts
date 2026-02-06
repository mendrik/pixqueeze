import type { RawImageData } from "../types";

export const ensureRawImageData = async (
	image: RawImageData | ImageBitmap,
): Promise<RawImageData> => {
	if (image instanceof ImageBitmap) {
		const canvas = new OffscreenCanvas(image.width, image.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Offscreen context failed");
		ctx.drawImage(image, 0, 0);
		const data = ctx.getImageData(0, 0, image.width, image.height);
		return {
			data: data.data,
			width: image.width,
			height: image.height,
		};
	}
	return image;
};

export const applySeparableGaussianBlur = (
	src: Float32Array,
	w: number,
	h: number,
	sigma: number,
): Float32Array => {
	const result = new Float32Array(src.length);
	const temp = new Float32Array(src.length);
	if (sigma <= 0) {
		result.set(src);
		return result;
	}

	const radius = Math.ceil(sigma * 3);
	const kernelSize = radius * 2 + 1;
	const kernel = new Float32Array(kernelSize);
	const sigmaSq2 = 2 * sigma * sigma;
	const normFactor = 1.0 / (Math.sqrt(2 * Math.PI) * sigma);

	let sumKernel = 0;
	for (let i = -radius; i <= radius; i++) {
		const val = normFactor * Math.exp(-(i * i) / sigmaSq2);
		kernel[i + radius] = val;
		sumKernel += val;
	}
	for (let i = 0; i < kernelSize; i++) {
		kernel[i] /= sumKernel;
	}

	// Horizontal Pass
	for (let y = 0; y < h; y++) {
		const rowOffset = y * w;
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let k = -radius; k <= radius; k++) {
				const nx = Math.min(Math.max(x + k, 0), w - 1);
				sum += src[rowOffset + nx] * kernel[k + radius];
			}
			temp[rowOffset + x] = sum;
		}
	}

	// Vertical Pass
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let sum = 0;
			for (let k = -radius; k <= radius; k++) {
				const ny = Math.min(Math.max(y + k, 0), h - 1);
				sum += temp[ny * w + x] * kernel[k + radius];
			}
			result[y * w + x] = sum;
		}
	}

	return result;
};

// Soft limiting function for Wavelet (Rational Sigmoid)
export const softLimit = (x: number, limit: number): number => {
	const absX = x < 0 ? -x : x;
	return x / (1 + absX / limit);
};
