import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import { AlertTriangle, ArrowLeft, FileWarning, RotateCcw } from "lucide-react";
import { api, AppError, openExternal } from "@/platform/api";
import { FormatError, parseDocument, parseDrawingLink } from "@/engine/format";
import { flattenForStandardEditor } from "@/engine/layers";
import type { AvenDocument } from "@/engine/types";
import { resolvedTheme, useSettings } from "@/store/settings";
import { allDrawings, useWorkspace } from "@/store/workspace";
import { askConfirm, openDrawing, toast, useUI } from "@/store/ui";
import { Button, Spinner } from "@/components/ui";
import { basename, join } from "@/lib/path";
import { debounce, errorMessage, formatDateTime, timeAgo } from "@/lib/utils";
import { EditorSession, layersActive, useEditor } from "./session";
import { finishPresetShape } from "./tools";
import { dotSpacing, themeFor } from "@/engine/canvasStyle";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { RightDock } from "./RightDock";
import { GaugePanel } from "./GaugePanel";
import { ChartPanel } from "./ChartPanel";
import { TextStylePanel } from "./TextStylePanel";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; doc: AvenDocument; modified: number; restoredFromRecovery: boolean }
  | { kind: "error"; message: string; corrupt: boolean; drawingId?: string };

async function loadDrawing(path: string): Promise<LoadState> {
  const tree = useWorkspace.getState().tree;
  const entry = allDrawings(tree, true).find((d) => d.path.toLowerCase() === path.toLowerCase()) ?? tree?.templates.find((d) => d.path === path);
  let text: string;
  try {
    text = await api.drawingRead(path);
  } catch (e) {
    const corrupt = e instanceof AppError && e.kind === "corrupt";
    return { kind: "error", message: errorMessage(e), corrupt, drawingId: entry?.id };
  }
  let doc: AvenDocument;
  try {
    doc = parseDocument(text, basename(path).replace(/\.aven$/i, ""));
  } catch (e) {
    return { kind: "error", message: errorMessage(e), corrupt: e instanceof FormatError, drawingId: entry?.id };
  }
  const modified = entry?.modified ?? 0;
  // Unsaved work from a crash or a disabled autosave?
  let restoredFromRecovery = false;
  const rec = await api.recoveryRead(doc.id).catch(() => null);
  if (rec && rec.content && rec.savedAt > doc.updatedAt) {
    const restore = await askConfirm({
      title: "Restore unsaved changes?",
      message: `Aven kept changes to “${doc.title}” from ${formatDateTime(rec.savedAt)} that were never saved to the file.`,
      confirmLabel: "Restore changes",
    });
    if (restore) {
      try {
        doc = parseDocument(rec.content, doc.title);
        restoredFromRecovery = true;
      } catch {
        toast({ kind: "error", title: "The recovered changes could not be read" });
      }
    } else await api.recoveryClear(doc.id).catch(() => {});
  }
  // Advanced editing off: show everything, keep the layer data.
  if (doc.layers && !layersActive() && doc.layers.hidden.length) {
    const r = flattenForStandardEditor(doc.scene.elements, doc.layers);
    doc = { ...doc, scene: { ...doc.scene, elements: r.scene }, layers: r.state };
  }
  return { kind: "ready", doc, modified, restoredFromRecovery };
}

export default function EditorScreen({ path }: { path: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    loadDrawing(path).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [path, nonce]);

  if (state.kind === "loading")
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  if (state.kind === "error") return <LoadError path={path} state={state} onRetry={() => setNonce((n) => n + 1)} />;
  return <Editor path={path} doc={state.doc} modified={state.modified} dirtyAtStart={state.restoredFromRecovery} />;
}

function LoadError({ path, state, onRetry }: { path: string; state: Extract<LoadState, { kind: "error" }>; onRetry: () => void }) {
  const wsId = useWorkspace((s) => s.active?.id);
  const [backups, setBackups] = useState<{ name: string; path: string; modified: number }[] | null>(null);
  useEffect(() => {
    if (wsId && state.drawingId) api.drawingBackups(wsId, state.drawingId).then(setBackups).catch(() => setBackups([]));
    else setBackups([]);
  }, [wsId, state.drawingId]);
  const restore = async (file: string) => {
    try {
      const content = await api.fileReadText(file);
      parseDocument(content);
      await api.drawingWrite({ wsId, path, content, drawingId: state.drawingId ?? "restored", policy: { enabled: false, minIntervalSec: 0, keep: 1 } });
      toast({ kind: "success", title: "Backup restored" });
      onRetry();
    } catch (e) {
      toast({ kind: "error", title: "This backup could not be restored", message: errorMessage(e) });
    }
  };
  return (
    <div className="grid h-full place-items-center bg-bg p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 anim-pop">
        <div className="flex items-start gap-3">
          <FileWarning className="mt-0.5 size-5 text-danger shrink-0" />
          <div className="min-w-0">
            <h1 className="text-md">{state.corrupt ? "This drawing is damaged" : "This drawing could not be opened"}</h1>
            <p className="mt-1 text-sm text-muted break-words">{state.message}</p>
            <p className="mt-1 text-xs text-faint break-all">{path}</p>
          </div>
        </div>
        {backups && backups.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-[600] text-muted">Restore from an automatic backup</p>
            <ul className="max-h-60 overflow-auto rounded-lg border border-border divide-y divide-border">
              {backups.map((b) => (
                <li key={b.path} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {formatDateTime(b.modified)} <span className="text-faint">· {timeAgo(b.modified)}</span>
                  </span>
                  <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => restore(b.path)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {backups && backups.length === 0 && state.corrupt && <p className="mt-4 text-sm text-muted">No automatic backups exist for this drawing yet.</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => useUI.getState().navigate({ name: "home", section: "home" })}>
            Back to workspace
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </div>
    </div>
  );
}

function Editor({ path, doc, modified, dirtyAtStart }: { path: string; doc: AvenDocument; modified: number; dirtyAtStart: boolean }) {
  const sessionRef = useRef<EditorSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new EditorSession(doc, path, modified, (p) => {
      const r = useUI.getState().route;
      if (r.name === "editor") useUI.setState({ route: { ...r, path: p } });
    });
  }
  const session = sessionRef.current;
  const conflict = useEditor((s) => s.saveState === "conflict");
  const canvasStyle = useEditor((s) => s.canvasStyle);
  // Gauges and charts have their own panel; the engine's style panel would only add noise
  // (and its changes are overwritten when they are rebuilt from their data).
  const generatedOnly = useEditor((s) => {
    const api = s.session?.api;
    if (!api || !s.selection.length) return false;
    void s.sceneTick;
    const byId = new Map(api.getSceneElements().map((e) => [e.id, e]));
    return s.selection.every((id) => {
      const cd = (byId.get(id)?.customData ?? {}) as Record<string, unknown>;
      return !!cd.avenGauge || !!cd.avenChart;
    });
  });
  const canvasHost = useRef<HTMLDivElement>(null);
  const conflictMsg = useEditor((s) => s.error);

  useEffect(() => {
    const ws = useWorkspace.getState();
    ws.addRecent({ path, id: doc.id, title: doc.title });
    session.activate();
    return () => {
      void session.deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReady = useCallback(
    (a: ExcalidrawImperativeAPI) => {
      session.attach(a);
      if (dirtyAtStart) session.markDirty();
      // drawings without a saved view open zoomed to fit their content
      if (doc.scene.appState.scrollX === undefined && doc.scene.elements.length)
        setTimeout(() => a.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: false }), 60);
      a.onPointerUp(() => finishPresetShape(a));
      // keep the dotted texture glued to the canvas while panning and zooming
      const syncDots = (scrollX: number, scrollY: number, zoom: { value: number }) => {
        const el = canvasHost.current;
        if (!el) return;
        const step = dotSpacing(zoom.value);
        el.style.setProperty("--dot-step", `${step}px`);
        el.style.setProperty("--dot-x", `${(scrollX * zoom.value) % step}px`);
        el.style.setProperty("--dot-y", `${(scrollY * zoom.value) % step}px`);
      };
      a.onScrollChange(syncDots);
      setTimeout(() => {
        const st = a.getAppState();
        syncDots(st.scrollX, st.scrollY, st.zoom);
      }, 80);
    },
    [session, dirtyAtStart, doc],
  );

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div ref={canvasHost} className={`absolute inset-0 aven-canvas ${canvasStyle === "dots" ? "canvas-dots" : ""} ${generatedOnly ? "generated-selected" : ""}`}>
        <Canvas doc={doc} onReady={onReady} onChange={session.onChange} />
      </div>
      <TopBar />
      {conflict && (
        <div role="alert" className="island absolute left-1/2 top-[64px] z-40 flex w-[min(880px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 px-4 py-2.5 text-sm anim-pop">
          <AlertTriangle className="size-4 text-danger shrink-0" />
          <span className="flex-1 text-text">{conflictMsg} Your changes are kept here and in recovery.</span>
          <Button size="sm" variant="secondary" onClick={() => session.resolveConflict("copy")}>
            Save mine as a copy
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (await askConfirm({ title: "Load the version on disk?", message: "Your unsaved changes in this window will be discarded (a recovery copy stays available).", confirmLabel: "Load disk version", danger: true }))
                openDrawing(session.path);
            }}
          >
            Load disk version
          </Button>
          <Button size="sm" variant="danger" onClick={() => session.resolveConflict("overwrite")}>
            Overwrite with mine
          </Button>
        </div>
      )}
      <ToolRail />
      <RightDock />
      <GaugePanel />
      <ChartPanel />
      <TextStylePanel />
    </div>
  );
}

const Canvas = memo(function Canvas({
  doc,
  onReady,
  onChange,
}: {
  doc: AvenDocument;
  onReady: (a: ExcalidrawImperativeAPI) => void;
  onChange: EditorSession["onChange"];
}) {
  const appTheme = useSettings((s) => s.settings.appearance.theme);
  const canvasStyle = useEditor((s) => s.canvasStyle);
  const theme = themeFor(canvasStyle, resolvedTheme(appTheme));
  const wsRoot = useWorkspace((s) => s.active?.path);

  const initialData = useMemo(() => {
    const s = useSettings.getState().settings;
    const a = doc.scene.appState;
    const libraryFile = wsRoot ? join(wsRoot, "Libraries", "library.excalidrawlib") : null;
    return async () => {
      let libraryItems: LibraryItems = [];
      if (libraryFile && (await api.pathExists(libraryFile).catch(() => false))) {
        try {
          const lib = JSON.parse(await api.fileReadText(libraryFile));
          libraryItems = lib.libraryItems ?? [];
        } catch {
          /* unreadable library: start empty, the file is left untouched */
        }
      }
      return {
        elements: doc.scene.elements,
        files: doc.scene.files,
        libraryItems,
        scrollToContent: a.scrollX === undefined,
        appState: {
          viewBackgroundColor: a.viewBackgroundColor,
          gridSize: a.gridSize,
          gridStep: a.gridStep,
          gridModeEnabled: a.gridModeEnabled,
          objectsSnapModeEnabled: a.objectsSnapModeEnabled,
          ...(a.scrollX !== undefined ? { scrollX: a.scrollX, scrollY: a.scrollY, zoom: { value: (a.zoom ?? 1) as any } } : {}),
          currentItemStrokeColor: a.currentItemStrokeColor ?? s.editor.defaultStrokeColor,
          currentItemBackgroundColor: a.currentItemBackgroundColor ?? s.editor.defaultBackgroundColor,
          currentItemStrokeWidth: a.currentItemStrokeWidth ?? s.editor.defaultStrokeWidth,
          currentItemRoughness: a.currentItemRoughness ?? s.editor.defaultRoughness,
          currentItemFontFamily: (a.currentItemFontFamily ?? s.editor.defaultFontFamily) as any,
          activeTool: { type: s.editor.defaultTool, customType: null, locked: false, lastActiveTool: null } as any,
        },
      };
    };
    // Only the first render matters: Excalidraw reads initialData once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveLibrary = useMemo(
    () =>
      debounce((items: LibraryItems) => {
        if (!wsRoot) return;
        const file = join(wsRoot, "Libraries", "library.excalidrawlib");
        api.fileWriteText(file, JSON.stringify({ type: "excalidrawlib", version: 2, source: "https://aven.app", libraryItems: items })).catch((e) =>
          toast({ kind: "error", title: "Library not saved", message: errorMessage(e) }),
        );
      }, 600),
    [wsRoot],
  );

  const onLinkOpen = useCallback((element: any, event: CustomEvent<{ nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement> }>) => {
    const link: string = element.link ?? "";
    event.preventDefault();
    const id = parseDrawingLink(link);
    if (id) {
      const target = allDrawings(useWorkspace.getState().tree, true).find((d) => d.id === id);
      if (!target) return toast({ kind: "warning", title: "The linked drawing was not found in this workspace" });
      const s = useEditor.getState().session;
      void (s ? s.flush() : Promise.resolve()).then(() => openDrawing(target.path));
      return;
    }
    if (/^https?:\/\//i.test(link) || link.startsWith("mailto:")) void openExternal(link);
  }, []);

  return (
    <Excalidraw
      excalidrawAPI={onReady}
      initialData={initialData}
      onChange={onChange}
      theme={theme}
      onLinkOpen={onLinkOpen}
      onLibraryChange={saveLibrary}
      aiEnabled={false}
      autoFocus
      UIOptions={{
        canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: null, clearCanvas: true, changeViewBackgroundColor: true },
        tools: { image: true },
      }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu>
    </Excalidraw>
  );
});
