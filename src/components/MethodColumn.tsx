import { useStore } from "@nanostores/react";
import { Grid, Loader2, Target } from "lucide-react";
import { isProcessingStore, processedResultsStore } from "../store";

interface MethodColumnProps {
	title: string;
	method: string;
	imageWidth: number;
	overrideSrc?: string;
	onZoom: (method: string) => void;
}

export const MethodColumn = ({
	title,
	method,
	imageWidth,
	overrideSrc,
	onZoom,
}: MethodColumnProps) => {
	const processedResults = useStore(processedResultsStore);
	const isProcessing = useStore(isProcessingStore);
	const url = overrideSrc ?? processedResults[method];
	const isSkill = method === "skill";

	return (
		<div className="method-column">
			<div className="method-header">
				<h3 className={`method-title ${isSkill ? "is-skill" : ""}`}>
					{isSkill ? <Grid size={12} /> : <Target size={12} />}
					{title}
				</h3>
			</div>

			{[1, 2].map((zoom) => (
				<div
					key={zoom}
					className={`zoom-container ${isSkill ? "is-skill" : ""}`}
				>
					<span className="zoom-label">{zoom}x View</span>
					<div className="zoom-viewport">
						{url ? (
							<button
								type="button"
								className="contents"
								onClick={() => onZoom(method)}
								aria-label={`Zoom ${title} result`}
							>
								<img
									src={url}
									alt={title}
									className="pixelated-img cursor-pointer transition-transform hover:scale-[1.02]"
									width={zoom * imageWidth}
								/>
							</button>
						) : isProcessing ? (
							<div className="loading-placeholder">
								<Loader2 size={16} className="animate-spin opacity-20" />
							</div>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
};
