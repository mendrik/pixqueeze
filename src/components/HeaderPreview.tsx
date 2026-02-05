import { useStore } from "@nanostores/react";
import { imageStore } from "../store";

export const HeaderPreview = () => {
	const image = useStore(imageStore);
	//	const contourDebug = useStore(contourDebugResultStore);

	if (!image) return null;

	return (
		<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
			<img
				src={image.src}
				alt="Preview"
				className="preview-image"
				title={`${image.width}x${image.height}`}
			/>
		</div>
	);
};
