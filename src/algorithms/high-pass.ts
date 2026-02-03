export type HighPassClippingMode = "clip" | "adjust";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const generateGaussianKernel = (
	stdDev: number,
	radius: number,
): Float32Array => {
	const kernel = new Float32Array(radius * 2 + 1);
	const sigma2 = 2 * stdDev * stdDev;
	const constant = 1 / (Math.sqrt(2 * Math.PI) * stdDev);
	for (let i = -radius; i <= radius; i++) {
		kernel[i + radius] = constant * Math.exp(-(i * i) / sigma2);
	}
	return kernel;
};

const applyGaussianBlur = (
	data: Uint8ClampedArray,
	width: number,
	height: number,
	stdDev: number,
): Uint8ClampedArray => {
	const output = new Uint8ClampedArray(data.length);

	const radius = Math.max(1, Math.ceil(stdDev * 2));
	const kernel = generateGaussianKernel(stdDev, radius);

	// Horizontal pass
	const temp = new Float32Array(data.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let wSum = 0;
			for (let k = -radius; k <= radius; k++) {
				const nx = Math.min(width - 1, Math.max(0, x + k));
				const weight = kernel[k + radius];
				const idx = (y * width + nx) * 4;
				r += data[idx] * weight;
				g += data[idx + 1] * weight;
				b += data[idx + 2] * weight;
				a += data[idx + 3] * weight;
				wSum += weight;
			}
			const outIdx = (y * width + x) * 4;
			temp[outIdx] = r / wSum;
			temp[outIdx + 1] = g / wSum;
			temp[outIdx + 2] = b / wSum;
			temp[outIdx + 3] = a / wSum;
		}
	}

	// Vertical pass
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let wSum = 0;
			for (let k = -radius; k <= radius; k++) {
				const ny = Math.min(height - 1, Math.max(0, y + k));
				const weight = kernel[k + radius];
				const idx = (ny * width + x) * 4;
				r += temp[idx] * weight;
				g += temp[idx + 1] * weight;
				b += temp[idx + 2] * weight;
				a += temp[idx + 3] * weight;
				wSum += weight;
			}
			const outIdx = (y * width + x) * 4;
			output[outIdx] = Math.round(r / wSum);
			output[outIdx + 1] = Math.round(g / wSum);
			output[outIdx + 2] = Math.round(b / wSum);
			output[outIdx + 3] = Math.round(a / wSum);
		}
	}

	return output;
};

export const applyHighPass = (
	data: Uint8ClampedArray,
	w: number,
	h: number,
	stdDev: number,
	contrast: number,
	_clipping: HighPassClippingMode,
): { highPassRgb01: Float32Array; intensity: Float32Array } => {
	const blurredData = applyGaussianBlur(data, w, h, stdDev);

	const highPassRgb01 = new Float32Array(w * h * 3);
	const intensity = new Float32Array(w * h);

	for (let i = 0; i < w * h; i++) {
		const idx = i * 4;
		let maxDiff = 0;

		for (let j = 0; j < 3; j++) {
			const val = (data[idx + j] - blurredData[idx + j]) * contrast + 128;
			const clampedVal = Math.max(0, Math.min(255, val));
			highPassRgb01[i * 3 + j] = clampedVal / 255;

			const diff = Math.abs(clampedVal - 128) / 128;
			if (diff > maxDiff) maxDiff = diff;
		}
		intensity[i] = clamp01(maxDiff);
	}

	return { highPassRgb01, intensity };
};
