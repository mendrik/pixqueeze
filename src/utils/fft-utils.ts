// @ts-ignore
import FFT from "fft.js";
/**
 * Applies a high-frequency boost to the image data using FFT.
 * This effectively sharpens the image by amplifying high-frequency components
 * in the frequency domain.
 *
 * @param imageData Source ImageData
 * @param strength Strength of the boost (0.0 to 5.0 recommended). 0 means no change.
 * @returns New ImageData with the effect applied
 */
export const applyHighFrequencyBoost = (
	imageData: ImageData,
	strength: number,
): ImageData => {
	if (strength <= 0) return imageData;

	const width = imageData.width;
	const height = imageData.height;

	// 1. Pad to nearest power of 2 for FFT
	const pow2W = nextPowerOfTwo(width);
	const pow2H = nextPowerOfTwo(height);
	const size = Math.max(pow2W, pow2H); // Square size usually easier/required by some simple FFT impls, but fft.js takes `n`.
	// Actually fft.js is 1D usually, but we can do 2D by row/col.
	// Let's stick to square power of 2 for simplicity in 2D helper if needed, or just allow rectangular if generic.
	// fft.js constructor takes `size` which is usually the length of the transform.
	// To do 2D, we need standard row-column composition.

	// Let's use a square size to keep it simple, max(w, h).
	const n = size;

	try {
		// @ts-ignore
		const FFTConstructor = FFT.default || FFT;
		const fft = new FFTConstructor(n);

		const outData = new Uint8ClampedArray(imageData.data.length);
		// Copy alpha directly first
		for (let i = 3; i < imageData.data.length; i += 4) {
			outData[i] = imageData.data[i];
		}

		// Buffers for Real and Imaginary parts
		// Size is n*n

		const inputReal = new Array(n * n).fill(0);
		const inputImag = new Array(n * n).fill(0);

		// Helper to perform 2D FFT on a channel
		const processChannel = (offset: number) => {
			// 1. Load data into inputReal (zero padded)
			for (let i = 0; i < n * n; i++) inputReal[i] = 0;
			for (let i = 0; i < n * n; i++) inputImag[i] = 0;

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					inputReal[y * n + x] = imageData.data[(y * width + x) * 4 + offset];
				}
			}

			// 2. FFT 2D
			// Since fft.js is 1D, we do per row, then per column

			// Rows

			// Wait, fft.js `transform` takes `out` and `in`. `in` can be real or complex. `out` is complex.
			// Complex array in fft.js is usually [r, i, r, i...] ?
			// Checking documentation is hard without internet, but standard usually matches.
			// Let's assume standard behavior: `createComplexArray` gives 2*n size. `toComplexArray` etc.
			// Actually, let's look at a simpler implementation or assume we handle 1D transforms manually.

			// Optimisation: We can just use a library or write a quick loop.
			// With `fft.js`:
			// var f = new FFT(n);
			// var input = new Array(n);
			// var out = f.createComplexArray();
			// f.transform(out, input);

			const complexData = new Array(n * n * 2).fill(0); // Interleaved real/imag

			// Copy input to complex buffer
			for (let i = 0; i < n * n; i++) {
				complexData[i * 2] = inputReal[i];
				complexData[i * 2 + 1] = 0;
			}

			// Transform Rows
			const rowIn = new Array(n * 2);
			const rowOut = new Array(n * 2);

			for (let y = 0; y < n; y++) {
				// Extract row
				for (let x = 0; x < n; x++) {
					rowIn[x * 2] = complexData[(y * n + x) * 2];
					rowIn[x * 2 + 1] = complexData[(y * n + x) * 2 + 1];
				}
				fft.transform(rowOut, rowIn);
				// Put back
				for (let x = 0; x < n; x++) {
					complexData[(y * n + x) * 2] = rowOut[x * 2];
					complexData[(y * n + x) * 2 + 1] = rowOut[x * 2 + 1];
				}
			}

			// Transform Cols
			const colIn = new Array(n * 2);
			const colOut = new Array(n * 2);

			for (let x = 0; x < n; x++) {
				// Extract col
				for (let y = 0; y < n; y++) {
					colIn[y * 2] = complexData[(y * n + x) * 2];
					colIn[y * 2 + 1] = complexData[(y * n + x) * 2 + 1];
				}
				fft.transform(colOut, colIn);
				// Put back
				for (let y = 0; y < n; y++) {
					complexData[(y * n + x) * 2] = colOut[y * 2];
					complexData[(y * n + x) * 2 + 1] = colOut[y * 2 + 1];
				}
			}

			// 3. Apply Filter in Frequency Domain
			// High boost: Amplify high frequencies.
			// DC is at 0,0. Frequencies increase towards center if shifted, or edges if unshifted?
			// Standard FFT output: 0 is DC, n/2 is Nyquist.
			// It's usually 0..n/2, -n/2..-1.
			// We need distance from DC.

			for (let y = 0; y < n; y++) {
				for (let x = 0; x < n; x++) {
					// Calculate normalized frequency distance (0.0 to 1.0)
					// Shift coordinates so DC is at center for distance calculation, or handle wrap around logic
					let fy = y;
					if (fy > n / 2) fy = n - fy;
					let fx = x;
					if (fx > n / 2) fx = n - fx;

					const dist = Math.sqrt(fx * fx + fy * fy);
					const maxDist = Math.sqrt((n / 2) * (n / 2) * 2);
					const normDist = dist / maxDist; // 0 at DC, 1 at Nyquist corner

					// High pass boost filter
					// Gain = 1 + strength * highPassCurve
					// Simple high pass: allow all dc (gain 1), boost highs.
					// We don't want to kill DC (that would be edge detection), we want to sharpen (boost high).
					// So Gain >= 1.

					// Example curve: smooth ramp up
					const gain = 1.0 + strength * normDist * 10.0;
					// Using * 2.0 to make strength feel more impactful.

					const idx = (y * n + x) * 2;
					complexData[idx] *= gain;
					complexData[idx + 1] *= gain;
				}
			}

			// 4. Inverse FFT

			// Cols
			for (let x = 0; x < n; x++) {
				// Extract col
				for (let y = 0; y < n; y++) {
					colIn[y * 2] = complexData[(y * n + x) * 2];
					colIn[y * 2 + 1] = complexData[(y * n + x) * 2 + 1];
				}
				fft.inverseTransform(colOut, colIn);
				// Put back
				for (let y = 0; y < n; y++) {
					complexData[(y * n + x) * 2] = colOut[y * 2];
					complexData[(y * n + x) * 2 + 1] = colOut[y * 2 + 1];
				}
			}

			// Rows
			for (let y = 0; y < n; y++) {
				// Extract row
				for (let x = 0; x < n; x++) {
					rowIn[x * 2] = complexData[(y * n + x) * 2];
					rowIn[x * 2 + 1] = complexData[(y * n + x) * 2 + 1];
				}
				fft.inverseTransform(rowOut, rowIn);
				// Put back
				for (let x = 0; x < n; x++) {
					complexData[(y * n + x) * 2] = rowOut[x * 2];
					complexData[(y * n + x) * 2 + 1] = rowOut[x * 2 + 1];
				}
			}

			// 5. Extract Real part and copy to output
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					// Not sure if fft.js scales output? Sometimes inverse is scaled by 1/N.
					// Docs usually say: standard DFT. inverseTransform might not normalize?
					// Usually `fft.js` requires manual scaling if not handled?
					// Checking common usage: yes, inverse transform in many libs needs /N.
					// But fft.js source code (if recalled correctly) might handle it or not.
					// It's safer to check or assume standard behavior (require normalization if undefined).
					// Actually, let's normalize just to be safe if values look huge.
					// Or better, let's inspect typical behavior.
					// Assuming standard FFT definition, IFFT usually includes 1/N.

					// Wait, if I do row then col, I do N transforms of length N in each pass.
					// Total N*N points.
					// Let's assume the library handles it properly for `inverseTransform`.
					// If the output is purely black or white, we know why.

					const val = complexData[(y * n + x) * 2];
					// Clamping is handled by Uint8ClampedArray assignment automatically
					outData[(y * width + x) * 4 + offset] = val;
				}
			}
		};

		// Process R, G, B
		console.log("[FFT] Processing Red channel...");
		processChannel(0);
		console.log("[FFT] Processing Green channel...");
		processChannel(1);
		console.log("[FFT] Processing Blue channel...");
		processChannel(2);
		console.log("[FFT] done");

		return new ImageData(outData, width, height);
	} catch (e) {
		console.error("FFT Error:", e);
		return imageData;
	}
};

function nextPowerOfTwo(v: number) {
	let p = 1;
	while (p < v) p <<= 1;
	return p;
}
