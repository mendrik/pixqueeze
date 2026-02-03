import {
	type StrokeParams,
	buildCandidateGraph,
	computeStrokeField,
	createImageGrid,
	extractPaths,
} from "../src/algorithms/path-tracer-core";

// Mock color data (R, G, B, A)
// Background: Black (0,0,0)
// Stroke: White (255,255,255) vertical line at x=5

const width = 10;
const height = 10;
const data = new Uint8ClampedArray(width * height * 4);

// Fill with background
for (let i = 0; i < data.length; i++) data[i] = 0; // Black transparent? No, alpha needs to be 255
for (let i = 3; i < data.length; i += 4) data[i] = 255; // Alpha opaque

// Draw vertical line at x=5
for (let y = 0; y < height; y++) {
	const i = (y * width + 5) * 4;
	data[i] = 255; // R
	data[i + 1] = 255; // G
	data[i + 2] = 255; // B
}

console.log("--- Starting Debug Path Tracer ---");

const grid = createImageGrid(data, width, height);
console.log(`Grid created: ${grid.width}x${grid.height}`);

const params: StrokeParams = {
	sigma: 5.0,
	tau: 25.0,
	scoreThreshold: 0.4,
	alpha: 1.0,
	beta: 2.0,
	gamma: 1.5,
};

console.log("Computing Stroke Field...");
const field = computeStrokeField(grid, params);
console.log(`Candidates found: ${field.candidates.size}`);

// Print candidates grid
if (field.candidates.size > 0) {
	let visualization = "";
	for (let y = 0; y < height; y++) {
		let row = "";
		for (let x = 0; x < width; x++) {
			const idx = y * width + x;
			row += field.candidates.has(idx) ? "X" : ".";
		}
		visualization += `${row}\n`;
	}
	console.log(`Candidate Map:\n${visualization}`);
} else {
	// Print scores for x=5 column
	console.log("No candidates. Inspecting scores for the line (x=5):");
	for (let y = 0; y < height; y++) {
		const idx = y * width + 5;
		console.log(`(5, ${y}): Score = ${field.scoreByIdx.get(idx)}`);
	}
}

console.log("Building Graph...");
const graph = buildCandidateGraph(grid, field, params);
const edgeCount = Array.from(graph.adj.values()).reduce(
	(acc, edges) => acc + edges.length,
	0,
);
console.log(`Graph: ${graph.nodes.length} nodes, ${edgeCount} edges`);

console.log("Extracting Paths...");
const paths = extractPaths(grid, graph);
console.log(`Paths found: ${paths.length}`);

paths.forEach((p, i) => {
	console.log(`Path ${i}: ${p.points.length} points, Closed: ${p.closed}`);
});
