import { atom } from "nanostores";

export type Point = Readonly<{ x: number; y: number }>;

export const imageStore = atom<HTMLImageElement | null>(null);
export const targetEdgeStore = atom<number>(32);
// New Stores
export const isProcessingStore = atom<boolean>(false);
export const progressStore = atom<number>(0);
export const processedResultsStore = atom<Record<string, string>>({});
export const bilateralStrengthStore = atom<number>(0.0);
export const waveletStrengthStore = atom<number>(0.25);
export const deblurMethodStore = atom<"none" | "bilateral" | "wavelet">(
	"wavelet",
);
export const maxEdgeStore = atom<number>(128);
export const maxColorsPerShadeStore = atom<number>(4);
