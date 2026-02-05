import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

interface ZoomDialogProps {
	isOpen: boolean;
	onClose: () => void;
	imageSrc: string;
	title: string;
	onNext: () => void;
	onPrev: () => void;
}

export const ZoomDialog = ({
	isOpen,
	onClose,
	imageSrc,
	title,
	onNext,
	onPrev,
}: ZoomDialogProps) => {
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowRight") {
				onNext();
			} else if (e.key === "ArrowLeft") {
				onPrev();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, onNext, onPrev]);

	if (!isOpen) return null;

	return (
		<div
			className="zoom-dialog-overlay"
			onClick={onClose}
			onKeyDown={(e) => e.key === "Escape" && onClose()}
			role="button"
			tabIndex={0}
		>
			<button
				type="button"
				className="nav-btn prev"
				onClick={(e) => {
					e.stopPropagation();
					onPrev();
				}}
				aria-label="Previous method"
			>
				<ChevronLeft size={32} />
			</button>

			<div className="zoom-dialog-content" role="presentation">
				<h2
					className="dialog-title"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
					role="presentation"
				>
					{title}
				</h2>
				<div
					className="zoom-wrapper"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
					role="presentation"
				>
					<img src={imageSrc} alt={title} className="pixelated-zoom" />
				</div>
			</div>

			<button
				type="button"
				className="nav-btn next"
				onClick={(e) => {
					e.stopPropagation();
					onNext();
				}}
				aria-label="Next method"
			>
				<ChevronRight size={32} />
			</button>
		</div>
	);
};
