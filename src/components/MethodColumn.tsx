import { useStore } from "@nanostores/react";
import { Grid, Target } from "lucide-react";
import { processedResultsStore } from "../store";

interface MethodColumnProps {
	title: string;
	method: string;
	overrideSrc?: string;
}

export const MethodColumn = ({
	title,
	method,
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

			{[1, 2, 4].map((zoom) => (
				<div
					key={zoom}
					className={`zoom-container ${isSkill ? "is-skill" : ""}`}
				>
					<span className="zoom-label">{zoom}x View</span>
					<div
						className="zoom-viewport"
						style={{ backgroundColor: "rgb(60, 60, 60)" }}
					>
						{url ? (
							<img
								src={url}
								alt={title}
								className="pixelated-img"
								style={{
									transform: `scale(${zoom})`,
								}}
							/>
						) : (
							<div className="pulse-placeholder" />
						)}
					</div>
				</div>
			))}
		</div>
	);
};
