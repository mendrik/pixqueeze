import type { ScalingAlgorithm } from "../types";
import { BicubicScaler } from "./bicubic-scaler";
import { ContourDebugScaler } from "./contour-debug-scaler";
import { EdgePriorityScaler } from "./edge-priority-scaler";
import { NearestScaler } from "./nearest-scaler";
import { PaletteAreaScaler } from "./palette-area-scaler";
import { SharpenerScaler } from "./sharpener-scaler";

export const SCALERS: ScalingAlgorithm[] = [
	NearestScaler,
	PaletteAreaScaler,
	BicubicScaler,
	EdgePriorityScaler,
	SharpenerScaler,
];
