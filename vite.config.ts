/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { comlink } from "vite-plugin-comlink";
import { defineConfig } from "vite";

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
