import { useStore } from "@nanostores/react";
import { imageStore } from "../store";

export const HeaderPreview = () => {
	const image = useStore(imageStore);

	if (!image) return null;

	return (
		<img
			src={image.src}
			alt="Preview"
			className="preview-image"
			title={`${image.width}x${image.height}`}
		/>
	);
};
