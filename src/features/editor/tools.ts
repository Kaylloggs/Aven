// Canvas tools, including Aven presets built on top of the engine's primitive tools.
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEditor } from "./session";

export type PresetId = "square" | "circle" | "rounded" | "double-arrow" | "connector";

let activePreset: PresetId | null = null;
export const getActivePreset = () => activePreset;

const engineToolFor: Record<PresetId, "rectangle" | "ellipse" | "arrow"> = {
  square: "rectangle",
  circle: "ellipse",
  rounded: "rectangle",
  "double-arrow": "arrow",
  connector: "arrow",
};

export function setTool(api: ExcalidrawImperativeAPI | null, tool: string) {
  if (!api) return;
  if (tool.startsWith("preset:")) {
    const p = tool.slice(7) as PresetId;
    activePreset = p;
    const a = api.getAppState();
    const patch: Record<string, unknown> = {};
    if (p === "rounded") patch.currentItemRoundness = "round";
    if (p === "square") patch.currentItemRoundness = "sharp";
    if (p === "double-arrow") {
      patch.currentItemStartArrowhead = "arrow";
      patch.currentItemEndArrowhead = "arrow";
      patch.currentItemArrowType = a.currentItemArrowType === "elbow" ? "round" : a.currentItemArrowType;
    }
    if (p === "connector") {
      patch.currentItemArrowType = "elbow";
      patch.currentItemStartArrowhead = null;
      patch.currentItemEndArrowhead = "arrow";
    }
    api.updateScene({ appState: patch as any, captureUpdate: CaptureUpdateAction.NEVER });
    api.setActiveTool({ type: engineToolFor[p] });
    useEditor.setState({ activeTool: tool });
    return;
  }
  // leaving a preset restores the engine defaults it changed
  if (activePreset === "double-arrow" || activePreset === "connector") {
    api.updateScene({ appState: { currentItemStartArrowhead: null, currentItemEndArrowhead: "arrow", currentItemArrowType: "round" } as any, captureUpdate: CaptureUpdateAction.NEVER });
  }
  activePreset = null;
  api.setActiveTool({ type: tool as any });
}

/** After a square/circle preset stroke, make the new shape perfectly regular. */
export function finishPresetShape(api: ExcalidrawImperativeAPI) {
  if (activePreset !== "square" && activePreset !== "circle") return;
  const a = api.getAppState();
  const ids = Object.keys(a.selectedElementIds);
  if (ids.length !== 1) return;
  const els = api.getSceneElements();
  const el = els.find((e) => e.id === ids[0]);
  if (!el || (el.type !== "rectangle" && el.type !== "ellipse")) return;
  if (Math.abs(el.width - el.height) < 0.5) return;
  const size = Math.max(el.width, el.height);
  api.updateScene({
    elements: els.map((e) => (e.id === el.id ? { ...e, width: size, height: size, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Trigger engine actions that have no imperative API (undo, redo) through its key handler. */
export function sendEngineKey(key: string, opts: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  const target = document.querySelector(".excalidraw") as HTMLElement | null;
  if (!target) return;
  const ev = new KeyboardEvent("keydown", {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    ctrlKey: !!opts.ctrl,
    shiftKey: !!opts.shift,
    altKey: !!opts.alt,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
}

export function undo() {
  const btn = document.querySelector<HTMLButtonElement>(".excalidraw .undo-button-container button, .excalidraw [data-testid='button-undo']");
  if (btn) btn.click();
  else sendEngineKey("z", { ctrl: true });
}

export function redo() {
  const btn = document.querySelector<HTMLButtonElement>(".excalidraw .redo-button-container button, .excalidraw [data-testid='button-redo']");
  if (btn) btn.click();
  else sendEngineKey("z", { ctrl: true, shift: true });
}

/** The tool to highlight: a preset stays highlighted while its engine tool is active. */
export function displayTool(engineTool: string): string {
  if (engineTool.startsWith("preset:")) return engineTool;
  if (activePreset && engineToolFor[activePreset] === engineTool) return `preset:${activePreset}`;
  if (activePreset) activePreset = null; // the user switched to another tool
  return engineTool;
}
