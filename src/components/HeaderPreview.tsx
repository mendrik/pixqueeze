import { useStore } from "@nanostores/react";
import { contourDebugResultStore, imageStore } from "../store";

export const HeaderPreview = () => {
	const image = useStore(imageStore);
	const contourDebug = useStore(contourDebugResultStore);

	if (!image) return null;

	return (
		<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
			<img
				src={image.src}
				alt="Preview"
				className="preview-image"
				title={`${image.width}x${image.height}`}
			/>
			{contourDebug && (
				<img
					src={contourDebug}
					alt="Contour Debug"
					className="preview-image"
					style={{ backgroundColor: "black" }} // To make transparent green lines visible if they are dark? They are green. Transparency on white/dark theme? Let's give it a checked bg or dark bg.
					// User requested transparent path background.
					// If I show it on white app bg, green is visible.
					// If I show it on dark app bg, green is visible.
					// Adding a border to visually separate.
				/>
			)}
		</div>
	);
};
