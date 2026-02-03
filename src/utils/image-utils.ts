export const getLum = (r: number, g: number, b: number): number => {
	return r * 0.299 + g * 0.587 + b * 0.114;
};
