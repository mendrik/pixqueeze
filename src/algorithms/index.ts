import type { ScalingAlgorithm } from "../types";
import { BicubicScaler } from "./bicubic-scaler";
import { EdgePriorityScaler } from "./edge-priority-scaler";
import { NearestScaler } from "./nearest-scaler";
import { SharpenerScaler } from "./sharpener-scaler";

export const SCALERS: ScalingAlgorithm[] = [
	NearestScaler,
	BicubicScaler,
	EdgePriorityScaler,
	SharpenerScaler,
];
