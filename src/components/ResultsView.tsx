import { useStore } from "@nanostores/react";
import { ImageIcon } from "lucide-react";
import { targetEdgeStore } from "../store";
import { MethodColumn } from "./MethodColumn";

export const ResultsView = ({ hasImage }: { hasImage: boolean }) => {
	const targetEdge = useStore(targetEdgeStore);

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
			<MethodColumn title="Nearest" method="nearest" imageWidth={targetEdge} />
			<MethodColumn
				title="Palette-Aware"
				method="palette-area"
				imageWidth={targetEdge}
			/>
			<MethodColumn title="Bicubic" method="bicubic" imageWidth={targetEdge} />
			<MethodColumn
				title="Superpixel"
				method="grid-superpixel-smart"
				imageWidth={targetEdge}
			/>
			<MethodColumn
				title="Palettesnap"
				method="megapixel"
				imageWidth={targetEdge}
			/>
		</div>
	);
};
