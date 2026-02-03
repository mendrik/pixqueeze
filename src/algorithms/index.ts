import type { ScalingAlgorithm } from "../types";
import { BicubicScaler } from "./bicubic-scaler";
import { MegapixelScaler } from "./megapixel-scaler";
import { NearestScaler } from "./nearest-scaler";
import { SuperpixelScaler } from "./superpixel-scaler";

export const SCALERS: ScalingAlgorithm[] = [
	NearestScaler,
	BicubicScaler,
	SuperpixelScaler,
	MegapixelScaler,
];
