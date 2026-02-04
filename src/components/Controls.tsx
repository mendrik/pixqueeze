import { useStore } from "@nanostores/react";
import { Loader2, Upload } from "lucide-react";
import {
	bilateralStrengthStore,
	deblurMethodStore,
	isProcessingStore,
	targetEdgeStore,
	waveletStrengthStore,
} from "../store";
import { HeaderPreview } from "./HeaderPreview";

export const Controls = ({
	onUpload,
}: {
	onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
	const targetEdge = useStore(targetEdgeStore);
	const deblurMethod = useStore(deblurMethodStore);
	const bilateralStrength = useStore(bilateralStrengthStore);
	const waveletStrength = useStore(waveletStrengthStore);
	const isProcessing = useStore(isProcessingStore);

	return (
		<div className="controls-section">
			<div className="control-group">
				<div className="control-header">
					<span>GRID SIZE</span>
					<span className="control-value">{targetEdge}PX</span>
				</div>
				<input
					type="range"
					min="16"
					max="128"
					step="1"
					value={targetEdge}
					onChange={(e) =>
						targetEdgeStore.set(Number.parseInt(e.target.value, 10))
					}
					className="range-input"
				/>
			</div>

			<div className="control-group">
				<div className="control-header">
					<span>DEBLUR METHOD</span>
					<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
						{isProcessing && (
							<Loader2 size={12} className="animate-spin control-value" />
						)}
						<span className="control-value">{deblurMethod.toUpperCase()}</span>
					</div>
				</div>
				<select
					className="dropdown-input"
					value={deblurMethod}
					onChange={(e) =>
						deblurMethodStore.set(
							e.target.value as "none" | "bilateral" | "wavelet",
						)
					}
				>
					<option value="none">None</option>
					<option value="bilateral">Bilateral Filter</option>
					<option value="wavelet">Wavelet Sharpen</option>
				</select>
			</div>

			{deblurMethod === "bilateral" && (
				<div className="control-group">
					<div className="control-header">
						<span>BILATERAL STRENGTH</span>
						<span className="control-value">
							{bilateralStrength.toFixed(3)}
						</span>
					</div>
					<input
						type="range"
						min="0"
						max="1.0"
						step="0.01"
						value={bilateralStrength}
						onChange={(e) =>
							bilateralStrengthStore.set(Number.parseFloat(e.target.value))
						}
						className="range-input"
					/>
				</div>
			)}

			{deblurMethod === "wavelet" && (
				<div className="control-group">
					<div className="control-header">
						<span>SHARPEN STRENGTH</span>
						<span className="control-value">{waveletStrength.toFixed(2)}</span>
					</div>
					<input
						type="range"
						min="0.0"
						max="1.5"
						step="0.05"
						value={waveletStrength}
						onChange={(e) =>
							waveletStrengthStore.set(Number.parseFloat(e.target.value))
						}
						className="range-input"
					/>
				</div>
			)}

			<HeaderPreview />

			<label className="upload-button">
				<Upload size={16} strokeWidth={3} />
				Upload
				<input
					type="file"
					className="hidden-input"
					onChange={onUpload}
					accept="image/*"
				/>
			</label>
		</div>
	);
};
