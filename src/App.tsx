import { useStore } from "@nanostores/react";
import { useCallback, useEffect } from "react";
import { SCALERS } from "./algorithms";
import { Controls } from "./components/Controls";
import { ResultsView } from "./components/ResultsView";
import {
	bilateralStrengthStore,
	deblurMethodStore,
	imageStore,
	isProcessingStore,
	maxEdgeStore,
	processedResultsStore,
	progressStore,
	targetEdgeStore,
	waveletStrengthStore,
} from "./store";
import "./App.css";

export const App = () => {
	// Only subscribe to what we need for logic
	const image = useStore(imageStore);
	// These are needed for the effect dependency array to trigger processing
	const targetEdge = useStore(targetEdgeStore);
	const deblurMethod = useStore(deblurMethodStore);
	const bilateralStrength = useStore(bilateralStrengthStore);
	const waveletStrength = useStore(waveletStrengthStore);

	const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset state for new upload
		processedResultsStore.set({});
		progressStore.set(0);

		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const MAX_SIZE = 256;
				if (img.width > MAX_SIZE || img.height > MAX_SIZE) {
					const ratio = img.width / img.height;
					let targetW = MAX_SIZE;
					let targetH = Math.round(MAX_SIZE / ratio);

					if (img.height > img.width) {
						targetH = MAX_SIZE;
						targetW = Math.round(MAX_SIZE * ratio);
					}

					const canvas = document.createElement("canvas");
					canvas.width = targetW;
					canvas.height = targetH;
					const ctx = canvas.getContext("2d");
					if (ctx) {
						ctx.drawImage(img, 0, 0, targetW, targetH);
						const scaledImg = new Image();
						scaledImg.onload = () => {
							const mEdge = Math.max(scaledImg.width, scaledImg.height);
							maxEdgeStore.set(mEdge);
							if (targetEdgeStore.get() > mEdge) {
								targetEdgeStore.set(mEdge);
							}
							imageStore.set(scaledImg);
						};
						scaledImg.src = canvas.toDataURL();
					} else {
						const mEdge = Math.max(img.width, img.height);
						maxEdgeStore.set(mEdge);
						if (targetEdgeStore.get() > mEdge) {
							targetEdgeStore.set(mEdge);
						}
						imageStore.set(img);
					}
				} else {
					const mEdge = Math.max(img.width, img.height);
					maxEdgeStore.set(mEdge);
					if (targetEdgeStore.get() > mEdge) {
						targetEdgeStore.set(mEdge);
					}
					imageStore.set(img);
				}
			};
			img.src = event.target?.result as string;
		};
		reader.readAsDataURL(file);
	};

	const processImages = useCallback(async () => {
		if (!image) return;
		isProcessingStore.set(true);
		progressStore.set(0);

		const ratio = image.width / image.height;
		const targetW = targetEdge;
		const targetH = Math.round(targetEdge / ratio);

		try {
			const results: Record<string, string> = {};
			for (const scaler of SCALERS) {
				results[scaler.id] = await scaler.process(image, targetW, targetH, {
					superpixelThreshold: 35, // Default for now since control is removed
					bilateralStrength: bilateralStrength,
					waveletStrength: waveletStrength,
					deblurMethod: deblurMethod,
					onProgress: (p: number) => progressStore.set(p),
				});
			}
			processedResultsStore.set(results);
		} catch (error) {
			console.error("Processing failed:", error);
		} finally {
			isProcessingStore.set(false);
		}
	}, [image, targetEdge, bilateralStrength, deblurMethod, waveletStrength]);

	useEffect(() => {
		if (!image) return;
		const timer = setTimeout(processImages, 100);
		return () => clearTimeout(timer);
	}, [processImages, image]);

	return (
		<div className="main-container">
			<div className="content-wrapper">
				<header className="app-header">
					<div className="logo-section">
						<div className="logo-icon-wrapper">
							<img src="/fox-clean.png" alt="Logo" />
						</div>
						<div className="logo-text">
							<h1 className="app-title">Pixqueeze</h1>
							<p className="app-subtitle">Superpixel scaling</p>
						</div>
					</div>

					<Controls onUpload={handleUpload} />
				</header>

				<ResultsView hasImage={!!image} />
			</div>
		</div>
	);
};

export default App;
