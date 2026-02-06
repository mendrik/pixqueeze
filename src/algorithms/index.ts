import type { ScalingAlgorithm } from "../types";
import { BicubicScaler } from "./bicubic-scaler";
import { ContrastAwareScaler } from "./contrast-aware-scaler";
import { EdgePriorityScaler } from "./edge-priority-scaler";
import { NearestScaler } from "./nearest-scaler";
import { SharpenerScaler } from "./sharpener-scaler";

export const SCALERS: ScalingAlgorithm[] = [
	NearestScaler,
	BicubicScaler,
	EdgePriorityScaler,
	ContrastAwareScaler,
	SharpenerScaler,
];
