import { useMemo } from "react";
import { Bold, Italic, Strikethrough, Underline } from "lucide-react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { gaugeIdsIn } from "@/engine/gauge";
import { hasStyle, styleTargets, toggleTextStyle, type TextStyleKey } from "@/engine/textStyle";
import { chartIdsIn } from "@/engine/charts";
import { IconButton } from "@/components/ui";
import { useEditor } from "./session";
import { FloatingBar } from "./FloatingBar";

/** Apply a text style to the current selection (used by the toolbar and Ctrl+B/I/U). */
export function applyTextStyle(key: TextStyleKey): boolean {
  const api = useEditor.getState().session?.api;
  if (!api) return false;
  const a = api.getAppState();
  if (a.editingTextElement) return false;
  const ids = Object.keys(a.selectedElementIds).filter((k) => a.selectedElementIds[k]);
  const next = toggleTextStyle(api.getSceneElements(), ids, key);
  if (!next) return false;
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return true;
}

const BUTTONS: { key: TextStyleKey; label: string; shortcut?: string; icon: React.ReactNode }[] = [
  { key: "bold", label: "Bold", shortcut: "Mod+B", icon: <Bold className="size-4" /> },
  { key: "italic", label: "Italic", shortcut: "Mod+I", icon: <Italic className="size-4" /> },
  { key: "underline", label: "Underline", shortcut: "Mod+U", icon: <Underline className="size-4" /> },
  { key: "strike", label: "Strikethrough", icon: <Strikethrough className="size-4" /> },
];

/** Floating B / I / U / S toolbar shown while text (or shapes with labels) is selected. */
export function TextStylePanel() {
  const selection = useEditor((s) => s.selection);
  const session = useEditor((s) => s.session);
  const tick = useEditor((s) => s.sceneTick);
  const state = useMemo(() => {
    const api = session?.api;
    if (!api || !selection.length) return null;
    const scene = api.getSceneElements();
    // gauges and charts have their own controls
    if (gaugeIdsIn(scene, selection).length || chartIdsIn(scene, selection).length) return null;
    const targets = styleTargets(scene, selection);
    if (!targets.length) return null;
    return Object.fromEntries(BUTTONS.map((b) => [b.key, targets.every((t) => hasStyle(t, b.key))])) as Record<TextStyleKey, boolean>;
  }, [selection, session, tick]);
  if (!state) return null;
  return (
    <FloatingBar label="Text style" role="toolbar">
      {BUTTONS.map((b) => (
        <IconButton key={b.key} label={b.label} shortcut={b.shortcut} tipSide="top" active={state[b.key]} onClick={() => applyTextStyle(b.key)}>
          {b.icon}
        </IconButton>
      ))}
    </FloatingBar>
  );
}
