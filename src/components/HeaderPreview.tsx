import { useStore } from "@nanostores/react";
import {
	contourDebugResultStore,
	highPassDebugResultStore,
	imageStore,
	phase0DebugResultStore,
	phase1DebugResultStore,
	phase2DebugResultStore,
	phase3DebugResultStore,
	thresholdDebugResultStore,
} from "../store";

const debug = false;

export const HeaderPreview = () => {
	const image = useStore(imageStore);
	const contourDebug = useStore(contourDebugResultStore);
	const highPassDebug = useStore(highPassDebugResultStore);
	const thresholdDebug = useStore(thresholdDebugResultStore);
	const p0 = useStore(phase0DebugResultStore);
	const p1 = useStore(phase1DebugResultStore);
	const p2 = useStore(phase2DebugResultStore);
	const p3 = useStore(phase3DebugResultStore);

	if (!image) return null;

	const commonStyle: React.CSSProperties = {
		borderColor: "rgba(255,255,255,0.1)",
		borderWidth: 1,
		borderStyle: "solid",
		backgroundColor: "#000",
	};

	return (
		<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
			<img
				src={image.src}
				alt="Preview"
				className="preview-image"
				title={`${image.width}x${image.height}`}
			/>
			{highPassDebug && debug && (
				<img
					src={highPassDebug}
					alt="High Pass"
					className="preview-image"
					style={commonStyle}
					title="High Pass Filter"
				/>
			)}
			{thresholdDebug && debug && (
				<img
					src={thresholdDebug}
					alt="Threshold"
					className="preview-image"
					style={commonStyle}
					title="Threshold"
				/>
			)}
			{contourDebug && debug && (
				<img
					src={contourDebug}
					alt="Contour Debug"
					className="preview-image"
					style={commonStyle}
					title="Contours"
				/>
			)}
			{p0 && (
				<img
					src={p0}
					alt="P0"
					className="preview-image"
					style={commonStyle}
					title="Phase 0: Stats"
				/>
			)}
			{p1 && (
				<img
					src={p1}
					alt="P1"
					className="preview-image"
					style={commonStyle}
					title="Phase 1: Easy Lines"
				/>
			)}
			{p2 && (
				<img
					src={p2}
					alt="P2"
					className="preview-image"
					style={commonStyle}
					title="Phase 2: Flat Areas"
				/>
			)}
			{p3 && (
				<img
					src={p3}
					alt="P3"
					className="preview-image"
					style={commonStyle}
					title="Phase 3: Final Resolution"
				/>
			)}
		</div>
	);
};
