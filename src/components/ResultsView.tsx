import { ImageIcon } from "lucide-react";
import { MethodColumn } from "./MethodColumn";

export const ResultsView = ({ hasImage }: { hasImage: boolean }) => {
	if (!hasImage) {
		return (
			<div className="empty-state">
				<ImageIcon size={48} className="empty-icon" />
				<p className="empty-text">Ready for Input</p>
			</div>
		);
	}

	return (
		<div className="results-grid">
			<MethodColumn title="Raw Nearest" method="nearest" />
			<MethodColumn title="High Bicubic" method="bicubic" />
			<MethodColumn title="Superpixel (Smart)" method="grid-superpixel-smart" />
			<MethodColumn title="Megapixel (Palette)" method="megapixel" />
		</div>
	);
};
