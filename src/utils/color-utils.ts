export interface Rgb {
	r: number;
	g: number;
	b: number;
	a?: number;
}

export interface Lab {
	l: number;
	a: number;
	b: number;
}

// D65 standard illuminant
const Xn = 95.047;
const Yn = 100.0;
const Zn = 108.883;

const rgbToXyz = (c: number): number => {
	const v = c / 255;
	return (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92) * 100;
};

const xyzToLab = (t: number): number => {
	return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
};

export const rgbToLab = (rgb: Rgb): Lab => {
	const { r, g, b } = rgb;

	const R = rgbToXyz(r);
	const G = rgbToXyz(g);
	const B = rgbToXyz(b);

	const x = R * 0.4124 + G * 0.3576 + B * 0.1805;
	const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
	const z = R * 0.0193 + G * 0.1192 + B * 0.9505;

	const X = x / Xn;
	const Y = y / Yn;
	const Z = z / Zn;

	const fx = xyzToLab(X);
	const fy = xyzToLab(Y);
	const fz = xyzToLab(Z);

	return {
		l: 116 * fy - 16,
		a: 500 * (fx - fy),
		b: 200 * (fy - fz),
	};
};

export const deltaE = (lab1: Lab, lab2: Lab): number => {
	const dl = lab1.l - lab2.l;
	const da = lab1.a - lab2.a;
	const db = lab1.b - lab2.b;
	return Math.sqrt(dl * dl + da * da + db * db);
};
