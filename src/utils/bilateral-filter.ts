/** Edge-preserving bilateral filter. */
export const applyBilateralFilter = (
	imageData: ImageData,
	strength: number,
): ImageData => {
	if (strength <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;
	const outData = new Uint8ClampedArray(srcData.length);

	const spatialSigma = 2.0 * (1 + strength * 2);
	const rangeSigma = 25.0 * (1 + strength);
	const windowRadius = Math.ceil(spatialSigma * 2);

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

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerIdx = (y * width + x) * 4;
			const centerR = srcData[centerIdx];
			const centerG = srcData[centerIdx + 1];
			const centerB = srcData[centerIdx + 2];
			const centerA = srcData[centerIdx + 3];

			outData[centerIdx + 3] = centerA;

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

					if (nA < 10) {
						weightIdx++;
						continue;
					}

					const dr = nR - centerR;
					const dg = nG - centerG;
					const db = nB - centerB;
					const colorDist = dr * dr + dg * dg + db * db;
					const rangeWeight = Math.exp(
						-colorDist / (2 * rangeSigma * rangeSigma),
					);

					const weight = spatialWeights[weightIdx] * rangeWeight;

					sumR += nR * weight;
					sumG += nG * weight;
					sumB += nB * weight;
					sumWeight += weight;

					weightIdx++;
				}
			}

			if (sumWeight > 0) {
				outData[centerIdx] = Math.round(sumR / sumWeight);
				outData[centerIdx + 1] = Math.round(sumG / sumWeight);
				outData[centerIdx + 2] = Math.round(sumB / sumWeight);
			} else {
				outData[centerIdx] = centerR;
				outData[centerIdx + 1] = centerG;
				outData[centerIdx + 2] = centerB;
			}
		}
	}

	return new ImageData(outData, width, height);
};

/** Unsharp mask for edge enhancement. */
export const applyUnsharpMask = (
	imageData: ImageData,
	amount: number,
): ImageData => {
	if (amount <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;

	const blurred = applyBoxBlur(imageData, 1);
	const blurredData = blurred.data;

	const outData = new Uint8ClampedArray(srcData.length);

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

/** Box blur helper. */
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
