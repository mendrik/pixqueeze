import { useStore } from "@nanostores/react";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { SCALERS } from "../algorithms";
import { imageStore, processedResultsStore, targetEdgeStore } from "../store";
import { MethodColumn } from "./MethodColumn";
import { ZoomDialog } from "./ZoomDialog";

export const ResultsView = ({ hasImage }: { hasImage: boolean }) => {
	const currentImage = useStore(imageStore);
	const targetEdge = useStore(targetEdgeStore);
	const processedResults = useStore(processedResultsStore);
	const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

	const handleNext = () => {
		if (!selectedMethod) return;
		const currentIndex = SCALERS.findIndex((s) => s.id === selectedMethod);
		const nextIndex = (currentIndex + 1) % SCALERS.length;
		setSelectedMethod(SCALERS[nextIndex].id);
	};

	const handlePrev = () => {
		if (!selectedMethod) return;
		const currentIndex = SCALERS.findIndex((s) => s.id === selectedMethod);
		const prevIndex = (currentIndex - 1 + SCALERS.length) % SCALERS.length;
		setSelectedMethod(SCALERS[prevIndex].id);
	};

	if (!hasImage) {
		return (
			<div className="empty-state">
				<ImageIcon size={48} className="empty-icon" />
				<p className="empty-text">Ready for Input</p>
			</div>
		);
	}

	const selectedScaler = SCALERS.find((s) => s.id === selectedMethod);
	const zoomImageSrc = selectedMethod ? processedResults[selectedMethod] : "";

	return (
		<>
			<div className="results-grid">
				{SCALERS.map((scaler) => {
					// Artist 2x always outputs at 50% of source width, ignoring targetEdge.
					// We display it at its natural result size appropriately.
					const displayWidth =
						scaler.id === "artist-2x"
							? Math.floor((currentImage?.naturalWidth ?? 0) / 2)
							: targetEdge;

					return (
						<MethodColumn
							key={scaler.id}
							title={scaler.name}
							method={scaler.id}
							imageWidth={displayWidth}
							onZoom={setSelectedMethod}
						/>
					);
				})}
			</div>

			{selectedMethod && selectedScaler && (
				<ZoomDialog
					isOpen={!!selectedMethod}
					onClose={() => setSelectedMethod(null)}
					imageSrc={zoomImageSrc}
					title={selectedScaler.name}
					onNext={handleNext}
					onPrev={handlePrev}
				/>
			)}
		</>
	);
};
