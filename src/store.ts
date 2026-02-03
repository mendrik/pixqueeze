import { atom, computed } from "nanostores";

export type Point = Readonly<{ x: number; y: number }>;

export const imageStore = atom<HTMLImageElement | null>(null);
export const targetEdgeStore = atom<number>(32);
// New Stores
export const isProcessingStore = atom<boolean>(false);
export const progressStore = atom<number>(0);
export const processedResultsStore = atom<Record<string, string>>({});
export const bilateralStrengthStore = atom<number>(0.0);
export const waveletStrengthStore = atom<number>(0.5);
export const deblurMethodStore = atom<"none" | "bilateral" | "wavelet">("none");

export const scalingParams = computed(
	[
		imageStore,
		targetEdgeStore,
		targetEdgeStore,
		bilateralStrengthStore,
		waveletStrengthStore,
		deblurMethodStore,
	],
	(
		image,
		targetEdge,
		_te,
		bilateralStrength,
		waveletStrength,
		deblurMethod,
	) => ({
		image,
		targetEdge,
		bilateralStrength,
		waveletStrength,
		deblurMethod,
	}),
);
