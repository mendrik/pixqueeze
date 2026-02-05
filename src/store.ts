import { atom } from "nanostores";

import type { DeblurMethod } from "./types";

export type Point = Readonly<{ x: number; y: number }>;

export const imageStore = atom<HTMLImageElement | null>(null);
export const targetEdgeStore = atom<number>(32);
// New Stores
export const isProcessingStore = atom<boolean>(false);
export const progressStore = atom<number>(0);
export const processedResultsStore = atom<Record<string, string>>({});
export const bilateralStrengthStore = atom<number>(0.0);
export const waveletStrengthStore = atom<number>(0.25);
export const deblurMethodStore = atom<DeblurMethod>("wavelet");
export const maxEdgeStore = atom<number>(128);
export const maxColorsPerShadeStore = atom<number>(15);
export const contourDebugResultStore = atom<string | null>(null);
export const contourOverlayStore = atom<boolean>(false);
