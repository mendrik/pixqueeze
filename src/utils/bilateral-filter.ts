/** Edge-preserving bilateral filter. */
export const applyBilateralFilter = (
	imageData: ImageData,
	strength: number,
): ImageData => {
	if (strength <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;
	const srcData = imageData.data;
	const srcData32 = new Uint32Array(srcData.buffer);
	const outData = new Uint8ClampedArray(srcData.length);
	const outData32 = new Uint32Array(outData.buffer);

	const spatialSigma = 2.0 * (1 + strength * 2);
	const rangeSigma = 25.0 * (1 + strength);
	const windowRadius = Math.ceil(spatialSigma * 2);

	const spatialWeights = new Float32Array((windowRadius * 2 + 1) ** 2);
	const spatialSigmaSq2 = 2 * spatialSigma * spatialSigma;
	let idx = 0;
	for (let dy = -windowRadius; dy <= windowRadius; dy++) {
		for (let dx = -windowRadius; dx <= windowRadius; dx++) {
			const dist = dx * dx + dy * dy;
			spatialWeights[idx++] = Math.exp(-dist / spatialSigmaSq2);
		}
	}

	// Range weights lookup table
	const rangeSigmaSq2 = 2 * rangeSigma * rangeSigma;
	const maxColorDist = 255 * 255 * 3;
	const rangeLookup = new Float32Array(maxColorDist + 1);
	for (let i = 0; i <= maxColorDist; i++) {
		rangeLookup[i] = Math.exp(-i / rangeSigmaSq2);
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerPos = y * width + x;
			const centerVal = srcData32[centerPos];
			const centerR = centerVal & 0xff;
			const centerG = (centerVal >> 8) & 0xff;
			const centerB = (centerVal >> 16) & 0xff;
			const centerA = (centerVal >> 24) & 0xff;

			if (centerA < 10) {
				outData32[centerPos] = centerVal;
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

				const rowOffset = ny * width;
				for (let dx = -windowRadius; dx <= windowRadius; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= width) {
						weightIdx++;
						continue;
					}

					const nVal = srcData32[rowOffset + nx];
					const nA = (nVal >> 24) & 0xff;
					if (nA < 10) {
						weightIdx++;
						continue;
					}

					const dr = (nVal & 0xff) - centerR;
					const dg = ((nVal >> 8) & 0xff) - centerG;
					const db = ((nVal >> 16) & 0xff) - centerB;
					const colorDist = dr * dr + dg * dg + db * db;
					const weight = spatialWeights[weightIdx] * rangeLookup[colorDist];

					sumR += (nVal & 0xff) * weight;
					sumG += ((nVal >> 8) & 0xff) * weight;
					sumB += ((nVal >> 16) & 0xff) * weight;
					sumWeight += weight;

					weightIdx++;
				}
			}

			if (sumWeight > 0) {
				const invWeight = 1.0 / sumWeight;
				const fr = (sumR * invWeight) | 0;
				const fg = (sumG * invWeight) | 0;
				const fb = (sumB * invWeight) | 0;
				outData32[centerPos] = (centerA << 24) | (fb << 16) | (fg << 8) | fr;
			} else {
				outData32[centerPos] = centerVal;
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
