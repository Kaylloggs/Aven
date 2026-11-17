// Aven's right-click menu for the canvas. The engine still works out what was clicked and selects
// it; its own menu is hidden (see app.css) and replaced by this one, whose commands run the
// engine's real actions through their keyboard shortcuts and clipboard events.
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { openContextMenu, type MenuItem } from "@/components/Menu";
import { canvasStyleItems } from "@/components/CanvasStylePicker";
import { resolvedTheme, useSettings } from "@/store/settings";
import { toast, useUI } from "@/store/ui";
import { CHART_KINDS, insertChart } from "./ChartPanel";
import { insertGauge } from "./GaugePanel";
import { useEditor } from "./session";

type Mods = { ctrl?: boolean; shift?: boolean; alt?: boolean };

const engineRoot = () => document.querySelector<HTMLElement>(".excalidraw");

/** Run an engine action through its shortcut. `code` is the physical key the engine tests. */
function shortcut(key: string, code: string, m: Mods = {}) {
  const root = engineRoot();
  if (!root) return;
  root.focus({ preventScroll: true });
  root.dispatchEvent(new KeyboardEvent("keydown", { key, code, ctrlKey: !!m.ctrl, shiftKey: !!m.shift, altKey: !!m.alt, bubbles: true, cancelable: true }));
}

/** Copy or cut the selection exactly like Ctrl+C / Ctrl+X (the engine listens to clipboard events). */
function clipboardCommand(cmd: "copy" | "cut") {
  engineRoot()?.focus({ preventScroll: true });
  document.execCommand(cmd);
}

/** Paste the clipboard at the point that was right-clicked. */
async function pasteAt(x: number, y: number) {
  const data = new DataTransfer();
  try {
    for (const item of await navigator.clipboard.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        if (type.startsWith("image/")) data.items.add(new File([blob], `pasted.${type.split("/")[1] || "png"}`, { type }));
        else if (type === "text/plain" || type === "text/html") data.setData(type, await blob.text());
      }
    }
  } catch {
    try {
      data.setData("text/plain", await navigator.clipboard.readText());
    } catch {
      toast({ kind: "info", title: "Press Ctrl+V to paste", message: "The clipboard could not be read from the menu." });
      return;
    }
  }
  engineRoot()?.focus({ preventScroll: true });
  // The engine pastes where the pointer last was; point it back at the right-click position.
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
  document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

function elementItems(x: number, y: number): MenuItem[] {
  const api = useEditor.getState().session?.api;
  if (!api) return [];
  const st = api.getAppState();
  const ids = Object.keys(st.selectedElementIds).filter((k) => st.selectedElementIds[k]);
  const scene = api.getSceneElements();
  const selected = scene.filter((e) => ids.includes(e.id) && !(e.type === "text" && (e as any).containerId && ids.includes((e as any).containerId)));
  const grouped = selected.some((e) => e.groupIds.length > 0) || Object.keys(st.selectedGroupIds ?? {}).length > 0;
  const allLocked = selected.length > 0 && selected.every((e) => e.locked);
  const single = selected.length === 1 ? selected[0] : null;

  return [
    { label: "Copy", shortcut: "Mod+C", onSelect: () => clipboardCommand("copy") },
    { label: "Paste", shortcut: "Mod+V", onSelect: () => void pasteAt(x, y) },
    { label: "Duplicate", shortcut: "Mod+D", onSelect: () => shortcut("d", "KeyD", { ctrl: true }) },
    "separator",
    { label: "Bring to front", shortcut: "Mod+Shift+]", onSelect: () => shortcut("]", "BracketRight", { ctrl: true, shift: true }) },
    { label: "Send to back", shortcut: "Mod+Shift+[", onSelect: () => shortcut("[", "BracketLeft", { ctrl: true, shift: true }) },
    ...(selected.length > 1 ? [{ label: "Group", shortcut: "Mod+G", onSelect: () => shortcut("g", "KeyG", { ctrl: true }) } as MenuItem] : []),
    ...(grouped ? [{ label: "Ungroup", shortcut: "Mod+Shift+G", onSelect: () => shortcut("G", "KeyG", { ctrl: true, shift: true }) } as MenuItem] : []),
    { label: allLocked ? "Unlock" : "Lock", shortcut: "Mod+Shift+L", onSelect: () => shortcut("L", "KeyL", { ctrl: true, shift: true }) },
    {
      label: "More",
      submenu: [
        { label: "Cut", shortcut: "Mod+X", onSelect: () => clipboardCommand("cut") },
        { label: "Copy style", shortcut: "Mod+Alt+C", onSelect: () => shortcut("c", "KeyC", { ctrl: true, alt: true }) },
        { label: "Paste style", shortcut: "Mod+Alt+V", onSelect: () => shortcut("v", "KeyV", { ctrl: true, alt: true }) },
        "separator",
        { label: "Bring forward", shortcut: "Mod+]", onSelect: () => shortcut("]", "BracketRight", { ctrl: true }) },
        { label: "Send backward", shortcut: "Mod+[", onSelect: () => shortcut("[", "BracketLeft", { ctrl: true }) },
        { label: "Flip horizontal", shortcut: "Shift+H", onSelect: () => shortcut("H", "KeyH", { shift: true }) },
        { label: "Flip vertical", shortcut: "Shift+V", onSelect: () => shortcut("V", "KeyV", { shift: true }) },
        "separator",
        ...(single ? [{ label: single.link ? "Edit link…" : "Add link…", shortcut: "Mod+K", onSelect: () => shortcut("k", "KeyK", { ctrl: true }) } as MenuItem] : []),
        { label: "Copy as PNG", shortcut: "Shift+Alt+C", onSelect: () => shortcut("C", "KeyC", { shift: true, alt: true }) },
      ],
    },
    "separator",
    { label: "Delete", shortcut: "Delete", danger: true, onSelect: () => shortcut("Delete", "Delete") },
  ];
}

function canvasItems(x: number, y: number): MenuItem[] {
  const api = useEditor.getState().session?.api ?? null;
  const style = useEditor.getState().canvasStyle;
  const grid = !!api?.getAppState().gridModeEnabled;
  return [
    { label: "Paste", shortcut: "Mod+V", onSelect: () => void pasteAt(x, y) },
    { label: "Select all", shortcut: "Mod+A", onSelect: () => shortcut("a", "KeyA", { ctrl: true }) },
    "separator",
    {
      label: "Insert",
      submenu: [
        { label: "Diagram from text…", onSelect: () => useUI.getState().setOverlay({ kind: "textDiagram" }) },
        "separator",
        ...CHART_KINDS.map((k) => ({ label: k.label, onSelect: () => insertChart(api, k.value) })),
        "separator",
        { label: "Percentage gauge", onSelect: () => insertGauge(api) },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom to fit", shortcut: "Shift+1", onSelect: () => shortcut("!", "Digit1", { shift: true }) },
        { label: "Grid", checked: grid, shortcut: "Mod+'", onSelect: () => api?.updateScene({ appState: { gridModeEnabled: !grid } as any, captureUpdate: CaptureUpdateAction.NEVER }) },
        "separator",
        { heading: "Background" },
        ...canvasStyleItems(style, resolvedTheme(useSettings.getState().settings.appearance.theme), (v) => useEditor.getState().session?.setCanvasStyle(v)),
      ],
    },
  ];
}

/**
 * Called just after the engine handled a right-click on the canvas: it has selected what was
 * under the pointer and prepared its own menu. Close that one and show Aven's instead.
 */
export function showCanvasMenu(x: number, y: number) {
  const api = useEditor.getState().session?.api;
  if (!api) return;
  const engineMenu = (api.getAppState() as any).contextMenu as { items: unknown[] } | null;
  if (!engineMenu) return;
  const onElement = engineMenu.items.some((it) => !!it && typeof it === "object" && (it as { name?: string }).name === "cut");
  api.updateScene({ appState: { contextMenu: null } as any, captureUpdate: CaptureUpdateAction.NEVER });
  openContextMenu(new MouseEvent("contextmenu", { clientX: x, clientY: y }), onElement ? elementItems(x, y) : canvasItems(x, y));
}
