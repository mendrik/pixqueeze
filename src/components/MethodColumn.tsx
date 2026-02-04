import { useStore } from "@nanostores/react";
import { Grid, Target } from "lucide-react";
import { processedResultsStore } from "../store";

interface MethodColumnProps {
	title: string;
	method: string;
	imageWidth: number;
	overrideSrc?: string;
}

export const MethodColumn = ({
	title,
	method,
	imageWidth,
	overrideSrc,
}: MethodColumnProps) => {
	const processedResults = useStore(processedResultsStore);
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

			{[1, 2, 3].map((zoom) => (
				<div
					key={zoom}
					className={`zoom-container ${isSkill ? "is-skill" : ""}`}
				>
					<span className="zoom-label">{zoom}x View</span>
					<div className="zoom-viewport">
						{url ? (
							<img
								src={url}
								alt={title}
								className="pixelated-img"
								width={zoom * imageWidth}
							/>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
};
