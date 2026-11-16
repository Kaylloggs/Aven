// Copies the drawing engine's font files into public/ so the app works fully offline.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = join(root, "public/fonts");
if (!existsSync(src)) throw new Error("Excalidraw fonts not found: run npm install");
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("engine fonts copied to public/fonts");
