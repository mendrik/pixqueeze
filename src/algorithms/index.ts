import type { ScalingAlgorithm } from "../types";
import { BicubicScaler } from "./bicubic-scaler";
import { ContourScaler } from "./contour-scaler";
import { NearestScaler } from "./nearest-scaler";
import { PaletteAreaScaler } from "./palette-area-scaler";
import { SharpenerScaler } from "./sharpener-scaler";

export const SCALERS: ScalingAlgorithm[] = [
	NearestScaler,
	PaletteAreaScaler,
	BicubicScaler,
	ContourScaler,
	SharpenerScaler,
];
