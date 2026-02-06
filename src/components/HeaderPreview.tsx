import { useStore } from "@nanostores/react";
import {
	contourDebugResultStore,
	highPassDebugResultStore,
	imageStore,
	thresholdDebugResultStore,
} from "../store";

export const HeaderPreview = () => {
	const image = useStore(imageStore);
	const contourDebug = useStore(contourDebugResultStore);
	const highPassDebug = useStore(highPassDebugResultStore);
	const thresholdDebug = useStore(thresholdDebugResultStore);

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
			{highPassDebug && (
				<img
					src={highPassDebug}
					alt="High Pass"
					className="preview-image"
					style={commonStyle}
					title="High Pass Filter"
				/>
			)}
			{thresholdDebug && (
				<img
					src={thresholdDebug}
					alt="Threshold"
					className="preview-image"
					style={commonStyle}
					title="Threshold"
				/>
			)}
			{contourDebug && (
				<img
					src={contourDebug}
					alt="Contour Debug"
					className="preview-image"
					style={commonStyle}
					title="Contours"
				/>
			)}
		</div>
	);
};
