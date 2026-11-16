import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, exportToSvg, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, Segmented, Switch } from "@/components/ui";
import { getBounds } from "@/engine/elements";
import type { BinaryFiles, ExcalidrawElement } from "@/engine/types";
import { toast, useUI } from "@/store/ui";
import { errorMessage } from "@/lib/utils";
import { looksLikeMermaid, outlineToBoard, parseOutline, type OutlineLayout } from "./textDiagram";
import { useEditor } from "./session";

type Mode = OutlineLayout | "mermaid";

const EXAMPLES: Record<Mode, string> = {
  mindmap: "Launch plan\n  Audience\n    Designers\n    Marketers\n  Channels\n    Newsletter\n    Social media\n  Budget\n  Timeline\n    Beta in March\n    Launch in May",
  orgchart: "CEO\n  Product\n    Design\n    Engineering\n  Marketing\n    Content\n    Growth\n  Operations",
  plan: "Website redesign\n  Research\n    Interviews\n    Analytics review\n  Design\n    Wireframes\n    Visual design\n  Build\n    Front end\n    CMS setup\n  Launch",
  flow: "Start\nReceive request\nIs it urgent?\n  Handle today\n  Add to backlog\nNotify the client\nDone",
  mermaid: "flowchart LR\n  A[Idea] --> B{Worth it?}\n  B -- yes --> C[Prototype]\n  B -- no --> D[Archive]\n  C --> E[Test with users]",
};

const MODES: { value: Mode; label: string }[] = [
  { value: "mindmap", label: "Mind map" },
  { value: "orgchart", label: "Org chart" },
  { value: "plan", label: "Plan" },
  { value: "flow", label: "Flow" },
  { value: "mermaid", label: "Mermaid" },
];

async function build(src: string, mode: Mode, handDrawn: boolean): Promise<{ elements: ExcalidrawElement[]; files: BinaryFiles }> {
  if (mode === "mermaid") {
    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
    const { elements, files } = await parseMermaidToExcalidraw(src, { themeVariables: { fontSize: "20px" } } as any);
    const els = convertToExcalidrawElements(elements as any, { regenerateIds: true }) as unknown as ExcalidrawElement[];
    return { elements: handDrawn ? els : els.map((e) => ({ ...e, roughness: 0 }) as ExcalidrawElement), files: (files ?? {}) as BinaryFiles };
  }
  const board = outlineToBoard(parseOutline(src), mode, handDrawn);
  return { elements: convertToExcalidrawElements(board.els as any, { regenerateIds: true }) as unknown as ExcalidrawElement[], files: {} };
}

export function TextDiagramDialog() {
  const close = () => useUI.getState().setOverlay(null);
  const [mode, setMode] = useState<Mode>("mindmap");
  const [src, setSrc] = useState(EXAMPLES.mindmap);
  const [handDrawn, setHandDrawn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const edited = useRef(false);

  // paste of Mermaid code switches to the Mermaid mode automatically
  useEffect(() => {
    if (looksLikeMermaid(src) && mode !== "mermaid") setMode("mermaid");
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const { elements, files } = await build(src, mode, handDrawn);
        if (!elements.length) {
          if (alive) setPreview(null);
          return;
        }
        const svg = await exportToSvg({ elements, appState: { exportBackground: true, viewBackgroundColor: "#ffffff" }, files, exportPadding: 20, skipInliningFonts: true });
        if (alive) {
          setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [src, mode, handDrawn]);

  const insert = async () => {
    const api = useEditor.getState().session?.api;
    if (!api) return;
    setBusy(true);
    try {
      const { elements, files } = await build(src, mode, handDrawn);
      if (!elements.length) return;
      const st = api.getAppState();
      const c = viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
      const b = getBounds(elements);
      const dx = c.x - (b.minX + b.width / 2);
      const dy = c.y - (b.minY + b.height / 2);
      const moved = elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }) as ExcalidrawElement);
      if (Object.keys(files).length) api.addFiles(Object.values(files));
      api.updateScene({
        elements: [...api.getSceneElements(), ...moved],
        appState: { selectedElementIds: Object.fromEntries(moved.map((e) => [e.id, true])) } as any,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      api.scrollToContent(moved, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
      close();
    } catch (e) {
      toast({ kind: "error", title: "Could not build the diagram", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={close} width={1040} bare>
      <div className="flex h-[min(680px,calc(100vh-48px))] flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="font-display mr-2 text-lg">Diagram from text</h2>
          <Segmented
            label="Diagram type"
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (!edited.current) setSrc(EXAMPLES[m]);
            }}
            options={MODES}
          />
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            <Switch label="Hand-drawn style" checked={handDrawn} onChange={setHandDrawn} /> Hand-drawn
          </label>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,2fr)_3fr]">
          <div className="flex min-h-0 flex-col border-r border-border p-4">
            <textarea
              value={src}
              spellCheck={false}
              aria-label="Diagram text"
              onChange={(e) => {
                edited.current = true;
                setSrc(e.target.value);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const s = t.selectionStart;
                  const v = `${src.slice(0, s)}  ${src.slice(t.selectionEnd)}`;
                  setSrc(v);
                  requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void insert();
              }}
              className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm leading-relaxed text-text focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-xs text-faint">
              {mode === "mermaid"
                ? "Mermaid flowcharts, sequence and class diagrams become editable shapes; other Mermaid types are inserted as images."
                : mode === "flow"
                  ? "One step per line. Lines ending with “?” become decisions; indent lines under a decision for its branches."
                  : "One idea per line. Indent with spaces or Tab to nest. Bullets (-, *, 1.) are optional."}
            </p>
          </div>
          <div className="dot-grid relative grid min-h-0 place-items-center overflow-hidden p-4">
            {error ? (
              <p className="max-w-sm text-center text-sm text-danger">{error}</p>
            ) : preview ? (
              <img src={preview} alt="Diagram preview" className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-[var(--shadow)]" />
            ) : (
              <Loader2 className="size-5 animate-spin text-muted" />
            )}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
          <span className="mr-auto text-xs text-faint">Ctrl+Enter to insert</span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!!error || !src.trim()} onClick={() => void insert()}>
            Insert diagram
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
