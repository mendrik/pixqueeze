/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { comlink } from "vite-plugin-comlink";

// https://vite.dev/config/
export default defineConfig({
	base: "./",
	plugins: [
		comlink(),
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler", {}]],
			},
		}),
	],
	test: {
		environment: "jsdom",
		globals: true,
	},
});
