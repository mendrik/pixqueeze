import { useStore } from "@nanostores/react";
import { useCallback, useEffect } from "react";
import { SCALERS } from "./algorithms";
import logo from "./assets/fox-clean.png";
import { Controls } from "./components/Controls";
import { ResultsView } from "./components/ResultsView";
import {
	bilateralStrengthStore,
	contourDebugResultStore,
	contourOverlayStore,
	deblurMethodStore,
	highPassDebugResultStore,
	imageStore,
	isProcessingStore,
	maxColorsPerShadeStore,
	maxEdgeStore,
	processedResultsStore,
	progressStore,
	targetEdgeStore,
	thresholdDebugResultStore,
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
	const maxColorsPerShade = useStore(maxColorsPerShadeStore);
	const contourOverlay = useStore(contourOverlayStore);

	const processFile = useCallback((file: Blob) => {
		// Reset state for new upload
		processedResultsStore.set({});
		contourDebugResultStore.set(null);
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
	}, []);

	const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		processFile(file);
	};

	useEffect(() => {
		const handlePaste = (e: ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			for (let i = 0; i < items.length; i++) {
				if (items[i].type.indexOf("image") !== -1) {
					const blob = items[i].getAsFile();
					if (blob) {
						processFile(blob);
						e.preventDefault(); // Prevent default paste behavior
						return;
					}
				}
			}
		};

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [processFile]);

	const processImages = useCallback(async () => {
		if (!image) return;
		isProcessingStore.set(true);
		progressStore.set(0);

		const ratio = image.width / image.height;
		const targetW = targetEdge;
		const targetH = Math.round(targetEdge / ratio);

		try {
			const results: Record<string, string> = {};

			// Contour debug moved to EdgePriorityScaler internal debug if needed
			// Stores reset above
			contourDebugResultStore.set(null);
			highPassDebugResultStore.set(null);
			thresholdDebugResultStore.set(null);

			for (const scaler of SCALERS) {
				results[scaler.id] = await scaler.process(image, targetW, targetH, {
					superpixelThreshold: 35, // Default for now since control is removed
					bilateralStrength: bilateralStrength,
					waveletStrength: waveletStrength,
					deblurMethod: deblurMethod,
					onProgress: (p: number) => progressStore.set(p),
					maxColorsPerShade: maxColorsPerShade,
					overlayContours: contourOverlay,
				});
			}
			processedResultsStore.set(results);
		} catch (error) {
			console.error("Processing failed:", error);
		} finally {
			isProcessingStore.set(false);
		}
	}, [
		image,
		targetEdge,
		bilateralStrength,
		deblurMethod,
		waveletStrength,
		maxColorsPerShade,
		contourOverlay,
	]);

	useEffect(() => {
		if (!image) return;
		const timer = setTimeout(processImages, 100);
		return () => clearTimeout(timer);
	}, [processImages, image]);

	return (
		<div className="main-container">
			<div className="content-wrapper">
				<div className="sidebar">
					<div className="logo-section">
						<div className="logo-icon-wrapper">
							<img src={logo} alt="Logo" />
						</div>
						<div className="logo-text">
							<h1 className="app-title">Pixqueeze</h1>
							<p className="app-subtitle">Superpixel scaling</p>
						</div>
					</div>

					<Controls onUpload={handleUpload} />
				</div>

				<div className="main-content">
					<ResultsView hasImage={!!image} />
				</div>
			</div>
		</div>
	);
};

export default App;
