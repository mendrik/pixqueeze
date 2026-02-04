import { useStore } from "@nanostores/react";
import { ImageIcon } from "lucide-react";
import { SCALERS } from "../algorithms";
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
			{SCALERS.map((scaler) => (
				<MethodColumn
					key={scaler.id}
					title={scaler.name}
					method={scaler.id}
					imageWidth={targetEdge}
				/>
			))}
		</div>
	);
};
