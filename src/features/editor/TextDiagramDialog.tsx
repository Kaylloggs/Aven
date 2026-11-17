import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, exportToSvg, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { IndentDecrease, IndentIncrease, Loader2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, Segmented, Switch } from "@/components/ui";
import { getBounds, randomId } from "@/engine/elements";
import type { BinaryFiles, ExcalidrawElement } from "@/engine/types";
import { toast, useUI } from "@/store/ui";
import { errorMessage } from "@/lib/utils";
import { continueLine, looksLikeMermaid, outlineToBoard, parseOutline, shiftLines, type OutlineLayout, type TextEdit } from "./textDiagram";
import { useEditor } from "./session";

type Mode = OutlineLayout | "mermaid";

// Examples show the dashes and the indentation, so the structure explains itself.
const EXAMPLES: Record<Mode, string> = {
  mindmap: "Launch plan\n- Audience\n  - Designers\n  - Marketers\n- Channels\n  - Newsletter\n  - Social media\n- Budget\n- Timeline\n  - Beta in March\n  - Launch in May",
  orgchart: "CEO\n- Product\n  - Design\n  - Engineering\n- Marketing\n  - Content\n  - Growth\n- Operations",
  plan: "Website redesign\n- Research\n  - Interviews\n  - Analytics review\n- Design\n  - Wireframes\n  - Visual design\n- Build\n  - Front end\n  - CMS setup\n- Launch",
  flow: "Start\nReceive request\nIs it urgent?\n- Handle today\n- Add to backlog\nNotify the client\nDone",
  mermaid: "flowchart LR\n  A[Idea] --> B{Worth it?}\n  B -- yes --> C[Prototype]\n  B -- no --> D[Archive]\n  C --> E[Test with users]",
};

/** How lines turn into the diagram, shown above the text for each layout. */
const LEGEND: Record<OutlineLayout, { code: string; note: string }[]> = {
  mindmap: [
    { code: "Launch plan", note: "the first line is the centre" },
    { code: "- Audience", note: "a dash makes a branch" },
    { code: "  - Designers", note: "indent it (Tab) to go one level deeper" },
  ],
  orgchart: [
    { code: "CEO", note: "the first line is the top" },
    { code: "- Product", note: "a dash puts a box under it" },
    { code: "  - Design", note: "indent it (Tab) for the next level" },
  ],
  plan: [
    { code: "Website redesign", note: "the first line is the project" },
    { code: "- Research", note: "a dash makes a phase" },
    { code: "  - Interviews", note: "indent it (Tab) for the tasks of a phase" },
  ],
  flow: [
    { code: "Receive request", note: "one step per line, in order" },
    { code: "Is it urgent?", note: "a question mark makes a decision" },
    { code: "- Handle today", note: "dashes under it are its branches" },
  ],
};

/** A legend line: indentation shown as faint dots, the dash and the "?" in the accent colour. */
function LegendCode({ code }: { code: string }) {
  const m = /^( *)(- )?(.*?)(\?)?$/.exec(code)!;
  return (
    <dt className="whitespace-pre font-mono text-[13px] text-text">
      {m[1] && <span className="text-faint">{"·".repeat(m[1].length)}</span>}
      {m[2] && <span className="font-[700] text-accent-text">- </span>}
      {m[3]}
      {m[4] && <span className="font-[700] text-accent-text">?</span>}
    </dt>
  );
}

const MODES: { value: Mode; label: string }[] = [
  { value: "mindmap", label: "Mind map" },
  { value: "orgchart", label: "Org chart" },
  { value: "plan", label: "Plan" },
  { value: "flow", label: "Flow" },
  { value: "mermaid", label: "Mermaid" },
];

export type DiagramMode = Mode;

/** What a diagram remembers, so it can be re-laid out or edited as text later. */
export interface DiagramInfo {
  id: string;
  source: string;
  mode: Mode;
  handDrawn: boolean;
}

export const diagramOf = (el: { customData?: Record<string, any> }): DiagramInfo | null => {
  const d = el.customData?.avenDiagram;
  return d && typeof d.id === "string" ? (d as DiagramInfo) : null;
};

/** Tag every element of a diagram and put them in one group, so the diagram selects as one object. */
function tagDiagram(els: ExcalidrawElement[], info: DiagramInfo): ExcalidrawElement[] {
  const group = randomId();
  return els.map((e) => ({ ...e, groupIds: [...e.groupIds, group], customData: { ...(e.customData ?? {}), avenDiagram: info } }) as ExcalidrawElement);
}

/** Replace a diagram with a new version of itself (same centre), or insert a new one at the centre of the view. */
export async function placeDiagram(info: DiagramInfo, replace: boolean) {
  const api = useEditor.getState().session?.api;
  if (!api) return;
  const { elements, files } = await build(info.source, info.mode, info.handDrawn);
  if (!elements.length) return;
  const scene = api.getSceneElements() as unknown as ExcalidrawElement[];
  const old = replace ? scene.filter((e) => !e.isDeleted && diagramOf(e)?.id === info.id) : [];
  let c: { x: number; y: number };
  if (old.length) {
    const ob = getBounds(old);
    c = { x: ob.minX + ob.width / 2, y: ob.minY + ob.height / 2 };
  } else {
    const st = api.getAppState();
    c = viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
  }
  const b = getBounds(elements);
  const dx = c.x - (b.minX + b.width / 2);
  const dy = c.y - (b.minY + b.height / 2);
  const moved = tagDiagram(
    elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }) as ExcalidrawElement),
    info,
  );
  if (Object.keys(files).length) api.addFiles(Object.values(files));
  const oldIds = new Set(old.map((e) => e.id));
  api.updateScene({
    elements: [...scene.filter((e) => !oldIds.has(e.id)), ...moved] as any,
    appState: { selectedElementIds: Object.fromEntries(moved.map((e) => [e.id, true])), selectedGroupIds: { [moved[0].groupIds.at(-1)!]: true } } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  if (!replace) api.scrollToContent(moved as any, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
}

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
  const overlay = useUI((s) => s.overlay);
  const editing = overlay?.kind === "textDiagram" ? overlay.edit : undefined;
  const [mode, setMode] = useState<Mode>((editing?.mode as Mode) ?? "mindmap");
  const [src, setSrc] = useState(editing?.source ?? EXAMPLES.mindmap);
  const [handDrawn, setHandDrawn] = useState(editing?.handDrawn ?? false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const edited = useRef(!!editing);
  const area = useRef<HTMLTextAreaElement>(null);
  const applyEdit = (e: TextEdit) => {
    edited.current = true;
    setSrc(e.value);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(e.start, e.end);
    });
  };
  const shift = (dir: 1 | -1) => {
    const t = area.current;
    if (t) applyEdit(shiftLines(src, t.selectionStart, t.selectionEnd, dir));
  };

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
    setBusy(true);
    try {
      await placeDiagram({ id: editing?.id ?? randomId(), source: src, mode, handDrawn }, !!editing);
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
            {mode !== "mermaid" && (
              <section aria-label="How it works" className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <h3 className="mb-1.5 text-xs font-[650] text-muted">How it works</h3>
                <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
                  {LEGEND[mode].map((l) => (
                    <div key={l.code} className="contents">
                      <LegendCode code={l.code} />
                      <dd className="text-xs text-muted">{l.note}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <div className="mb-1.5 flex items-center gap-1">
              {mode !== "mermaid" && (
                <>
                  <Button size="sm" variant="ghost" icon={<IndentIncrease className="size-3.5" />} onClick={() => shift(1)}>
                    Indent
                  </Button>
                  <Button size="sm" variant="ghost" icon={<IndentDecrease className="size-3.5" />} onClick={() => shift(-1)}>
                    Outdent
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => {
                  edited.current = false;
                  setSrc(EXAMPLES[mode]);
                }}
              >
                Show the example
              </Button>
            </div>
            <textarea
              ref={area}
              value={src}
              spellCheck={false}
              aria-label="Diagram text"
              placeholder={mode === "mermaid" ? "flowchart LR\n  A --> B" : "Main idea\n- Branch\n  - Detail"}
              onChange={(e) => {
                edited.current = true;
                setSrc(e.target.value);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                const t = e.currentTarget;
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void insert();
                } else if (e.key === "Tab" && mode !== "mermaid") {
                  e.preventDefault();
                  applyEdit(shiftLines(src, t.selectionStart, t.selectionEnd, e.shiftKey ? -1 : 1));
                } else if (e.key === "Enter" && !e.shiftKey && mode !== "mermaid" && t.selectionStart === t.selectionEnd) {
                  e.preventDefault();
                  applyEdit(continueLine(src, t.selectionStart));
                }
              }}
              className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm leading-relaxed text-text focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-xs text-faint">
              {mode === "mermaid"
                ? "Mermaid flowcharts, sequence and class diagrams become editable shapes; other Mermaid types are inserted as images."
                : "Tab indents, Shift+Tab outdents, Enter starts the next line with the same dash."}
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
            {editing ? "Update diagram" : "Insert diagram"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
