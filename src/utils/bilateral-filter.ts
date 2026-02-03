/**
 * Bilateral Filter - Edge-preserving smoothing
 * Much better for pixel art than FFT because it smooths while preserving sharp edges
 */

/**
 * Applies a bilateral filter to smooth the image while preserving edges.
 * This is superior to FFT for pixel art because it:
 * - Preserves sharp color boundaries (edges)
 * - Reduces noise and jaggies
 * - Doesn't introduce ringing artifacts like FFT
 *
 * @param imageData Source ImageData
 * @param strength Strength of the effect (0.0 to 1.0)
 * @returns New ImageData with the effect applied
 */
export const applyBilateralFilter = (
	imageData: ImageData,
	strength: number,
): ImageData => {
	if (strength <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;
	const outData = new Uint8ClampedArray(srcData.length);

	// Bilateral filter parameters
	// Spatial standard deviation (how far to look for neighbors)
	const spatialSigma = 2.0 * (1 + strength * 2);
	// Range standard deviation (how different colors can be to still be averaged)
	const rangeSigma = 25.0 * (1 + strength);

	const windowRadius = Math.ceil(spatialSigma * 2);

	// Precompute Gaussian spatial weights
	const spatialWeights = new Float32Array((windowRadius * 2 + 1) ** 2);
	let idx = 0;
	for (let dy = -windowRadius; dy <= windowRadius; dy++) {
		for (let dx = -windowRadius; dx <= windowRadius; dx++) {
			const dist = dx * dx + dy * dy;
			spatialWeights[idx++] = Math.exp(
				-dist / (2 * spatialSigma * spatialSigma),
			);
		}
	}

	// Process each pixel
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerIdx = (y * width + x) * 4;
			const centerR = srcData[centerIdx];
			const centerG = srcData[centerIdx + 1];
			const centerB = srcData[centerIdx + 2];
			const centerA = srcData[centerIdx + 3];

			// Copy alpha directly
			outData[centerIdx + 3] = centerA;

			// Skip transparent pixels
			if (centerA < 10) {
				outData[centerIdx] = centerR;
				outData[centerIdx + 1] = centerG;
				outData[centerIdx + 2] = centerB;
				continue;
			}

			let sumR = 0;
			let sumG = 0;
			let sumB = 0;
			let sumWeight = 0;

			let weightIdx = 0;
			for (let dy = -windowRadius; dy <= windowRadius; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= height) {
					weightIdx += windowRadius * 2 + 1;
					continue;
				}

				for (let dx = -windowRadius; dx <= windowRadius; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= width) {
						weightIdx++;
						continue;
					}

					const neighborIdx = (ny * width + nx) * 4;
					const nR = srcData[neighborIdx];
					const nG = srcData[neighborIdx + 1];
					const nB = srcData[neighborIdx + 2];
					const nA = srcData[neighborIdx + 3];

					// Skip transparent neighbors
					if (nA < 10) {
						weightIdx++;
						continue;
					}

					// Calculate color distance (range weight)
					const dr = nR - centerR;
					const dg = nG - centerG;
					const db = nB - centerB;
					const colorDist = dr * dr + dg * dg + db * db;
					const rangeWeight = Math.exp(
						-colorDist / (2 * rangeSigma * rangeSigma),
					);

					// Combined weight (spatial * range)
					const weight = spatialWeights[weightIdx] * rangeWeight;

					sumR += nR * weight;
					sumG += nG * weight;
					sumB += nB * weight;
					sumWeight += weight;

					weightIdx++;
				}
			}

			// Normalize and write output
			if (sumWeight > 0) {
				outData[centerIdx] = Math.round(sumR / sumWeight);
				outData[centerIdx + 1] = Math.round(sumG / sumWeight);
				outData[centerIdx + 2] = Math.round(sumB / sumWeight);
			} else {
				// Fallback if no valid neighbors
				outData[centerIdx] = centerR;
				outData[centerIdx + 1] = centerG;
				outData[centerIdx + 2] = centerB;
			}
		}
	}

	return new ImageData(outData, width, height);
};

/**
 * Applies unsharp masking for edge enhancement
 * This is a simpler, more predictable alternative to FFT sharpening
 *
 * @param imageData Source ImageData
 * @param amount Sharpening amount (0.0 to 2.0 recommended)
 * @returns New ImageData with sharpening applied
 */
export const applyUnsharpMask = (
	imageData: ImageData,
	amount: number,
): ImageData => {
	if (amount <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;

	// First, create a blurred version using simple box blur
	const blurred = applyBoxBlur(imageData, 1);
	const blurredData = blurred.data;

	// Create output
	const outData = new Uint8ClampedArray(srcData.length);

	// Unsharp mask formula: output = original + amount * (original - blurred)
	for (let i = 0; i < srcData.length; i += 4) {
		const alpha = srcData[i + 3];
		outData[i + 3] = alpha;

		if (alpha < 10) {
			outData[i] = srcData[i];
			outData[i + 1] = srcData[i + 1];
			outData[i + 2] = srcData[i + 2];
			continue;
		}

		for (let c = 0; c < 3; c++) {
			const original = srcData[i + c];
			const blur = blurredData[i + c];
			const diff = original - blur;
			outData[i + c] = Math.max(0, Math.min(255, original + diff * amount));
		}
	}

	return new ImageData(outData, width, height);
};

/**
 * Simple box blur helper for unsharp mask
 */
function applyBoxBlur(imageData: ImageData, radius: number): ImageData {
	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;
	const outData = new Uint8ClampedArray(srcData.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerIdx = (y * width + x) * 4;

			outData[centerIdx + 3] = srcData[centerIdx + 3];

			if (srcData[centerIdx + 3] < 10) {
				outData[centerIdx] = srcData[centerIdx];
				outData[centerIdx + 1] = srcData[centerIdx + 1];
				outData[centerIdx + 2] = srcData[centerIdx + 2];
				continue;
			}

			let sumR = 0;
			let sumG = 0;
			let sumB = 0;
			let count = 0;

			for (let dy = -radius; dy <= radius; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= height) continue;

				for (let dx = -radius; dx <= radius; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= width) continue;

					const idx = (ny * width + nx) * 4;
					if (srcData[idx + 3] < 10) continue;

					sumR += srcData[idx];
					sumG += srcData[idx + 1];
					sumB += srcData[idx + 2];
					count++;
				}
			}

			if (count > 0) {
				outData[centerIdx] = sumR / count;
				outData[centerIdx + 1] = sumG / count;
				outData[centerIdx + 2] = sumB / count;
			} else {
				outData[centerIdx] = srcData[centerIdx];
				outData[centerIdx + 1] = srcData[centerIdx + 1];
				outData[centerIdx + 2] = srcData[centerIdx + 2];
			}
		}
	}

	return new ImageData(outData, width, height);
}
