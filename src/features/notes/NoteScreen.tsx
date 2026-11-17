import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, CloudOff, Loader2, MoreHorizontal, TriangleAlert } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { api, openExternal, revealInExplorer } from "@/platform/api";
import { Button, IconButton, Spinner } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { DrawingPicker } from "@/features/overlays/DrawingPicker";
import { allDocuments, projectFor, useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { askConfirm, openDocument, toast, useUI } from "@/store/ui";
import { dirname, join } from "@/lib/path";
import { errorMessage, timeAgo } from "@/lib/utils";
import { closeEditorIfOpen } from "@/features/commands";
import { liveMarkdown, type LinkCandidate } from "./liveMarkdown";
import { activeState, insertLink, wordCount, type ActiveState } from "./noteCommands";
import { NoteToolbar } from "./NoteToolbar";
import { PROJECT_COLORS } from "@/components/ui";
import { resolveLink } from "./links";
import { noteTitle, useNote } from "./noteStore";

function SaveStatus() {
  const state = useNote((s) => s.saveState);
  const last = useNote((s) => s.lastSavedAt);
  const m = {
    saved: { icon: <Check className="size-3.5 text-success" />, text: last ? `Saved ${timeAgo(last)}` : "Saved" },
    dirty: { icon: <span className="size-2 rounded-full bg-warning" />, text: "Saving soon" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    error: { icon: <CloudOff className="size-3.5 text-danger" />, text: "Not saved" },
    conflict: { icon: <TriangleAlert className="size-3.5 text-danger" />, text: "Changed on disk" },
  }[state];
  return (
    <span className="flex h-7 items-center gap-1.5 px-2 text-xs text-muted" aria-live="polite">
      {m.icon}
      {m.text}
    </span>
  );
}

async function leave() {
  await useNote.getState().close();
  await useWorkspace.getState().refresh();
  useUI.getState().back();
}

/** Open what a [[link]] names, or offer to create the note it asks for (as Obsidian does). */
async function followLink(target: string) {
  const { path } = useNote.getState();
  const doc = resolveLink(useWorkspace.getState().tree, target, path);
  await useNote.getState().flush();
  if (doc) return openDocument(doc.path);
  if (!(await askConfirm({ title: `Create “${target}”?`, message: "No whiteboard, board or note has this name yet. Create a note next to this one?", confirmLabel: "Create note" }))) return;
  const created = await useWorkspace.getState().createNote(dirname(path), target);
  openDocument(created);
}

function NoteEditor({ path, initial }: { path: string; initial: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(noteTitle(path));
  const [picker, setPicker] = useState(false);
  const [fmt, setFmt] = useState<ActiveState>(() => activeState(EditorState.create({ doc: initial })));
  const words = useNote((s) => wordCount(s.text));
  const lastSaved = useNote((s) => s.lastSavedAt);
  const tree = useWorkspace((s) => s.tree);
  const project = projectFor(tree, path);
  const ob = useSettings((s) => s.settings.export.obsidian);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: liveMarkdown({
          candidates: () =>
            allDocuments(useWorkspace.getState().tree)
              .filter((d) => d.path.toLowerCase() !== useNote.getState().path.toLowerCase())
              .sort((a, b) => b.updated - a.updated)
              .map<LinkCandidate>((d) => ({ title: d.title, kind: d.kind, where: d.project?.meta.name ?? "Drawings" })),
          openWikilink: (t) => void followLink(t),
          openHref: (href) => {
            if (/^(https?:|mailto:)/i.test(href)) void openExternal(href);
            else void followLink(decodeURIComponent(href).replace(/\.md$/i, ""));
          },
          onChange: (text) => useNote.getState().change(text),
          onState: setFmt,
          linkKind: (t) => resolveLink(useWorkspace.getState().tree, t, useNote.getState().path)?.kind ?? null,
        }),
      }),
    });
    viewRef.current = view;
    // a new note starts on its title, an empty one on its text
    if (!initial && noteTitle(path).startsWith("Untitled")) titleRef.current?.select();
    else if (!initial) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // the editor is created once per opened note
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async () => {
    const next = title.trim();
    const current = noteTitle(useNote.getState().path);
    if (!next || next === current) return setTitle(current);
    await useNote.getState().flush();
    try {
      const np = await api.itemRename(useNote.getState().path, next);
      useNote.setState({ path: np, modified: 0 });
      setTitle(noteTitle(np));
      await useWorkspace.getState().refresh();
    } catch (e) {
      setTitle(current);
      toast({ kind: "error", title: "Could not rename the note", message: errorMessage(e) });
    }
  };

  const moreMenu = (el: HTMLElement) =>
    openMenuAt(
      el,
      [
        {
          label: "Copy as Markdown",
          hint: "paste in Notion",
          onSelect: async () => {
            await navigator.clipboard.writeText(useNote.getState().text);
            toast({ kind: "success", title: "Note copied", message: "Paste it in Notion, Obsidian or any Markdown editor." });
          },
        },
        {
          label: "Copy to Obsidian vault",
          disabled: !ob.vaultPath,
          hint: ob.vaultPath ? undefined : "set a vault first",
          onSelect: async () => {
            const dir = join(ob.vaultPath!, ob.folder.replace(/\//g, "\\"));
            await api.dirCreate(dir);
            const file = join(dir, `${noteTitle(useNote.getState().path)}.md`);
            await api.fileWriteText(file, useNote.getState().text);
            toast({ kind: "success", title: "Note written to your vault", message: file });
          },
        },
        "separator",
        { label: "Show in File Explorer", onSelect: () => void revealInExplorer(useNote.getState().path) },
      ],
      "end",
    );

  return (
    <div className="dot-grid relative h-full overflow-hidden">
      <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start gap-3">
        <div className="island pointer-events-auto flex h-11 min-w-0 items-center gap-1 px-1.5">
          <IconButton label="Back" shortcut="Mod+W" onClick={() => void leave()}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <span className="truncate px-1.5 text-sm text-muted">{project?.meta.name ?? "Drawings"}</span>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
          <span className="max-w-72 truncate px-1.5 text-sm font-[650]">{title || "Untitled"}</span>
          <SaveStatus />
        </div>
        <div className="flex-1" />
        <div className="island pointer-events-auto flex h-11 items-center gap-1 px-1.5">
          <IconButton label="Note options" onClick={(e) => moreMenu(e.currentTarget)}>
            <MoreHorizontal className="size-4" />
          </IconButton>
        </div>
      </header>
      <div className="pointer-events-none absolute left-3 top-1/2 z-30 flex -translate-y-1/2 anim-fade">
        <NoteToolbar view={() => viewRef.current} state={fmt} onLink={() => setPicker(true)} />
      </div>
      <main className="absolute inset-0 overflow-y-auto pt-[72px]">
        <article
          style={{ ["--fold" as any]: project ? PROJECT_COLORS[project.meta.color] : "var(--facet-violet)" }}
          className="note-page fold mx-auto mb-24 min-h-[calc(100%-96px)] w-[min(760px,calc(100%-32px))] overflow-hidden rounded-2xl border border-border bg-surface px-[clamp(20px,6vw,72px)] pb-24 pt-14 shadow-[var(--shadow-sm)]"
        >
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
                viewRef.current?.focus();
              }
              if (e.key === "Escape") setTitle(noteTitle(useNote.getState().path));
            }}
            placeholder="Untitled"
            aria-label="Note title"
            className="font-display w-full bg-transparent text-[2.25rem] font-[700] leading-tight tracking-[-0.02em] text-text outline-none placeholder:text-faint"
          />
          <p className="mb-7 mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
            <span>{project?.meta.name ?? "Drawings"}</span>
            <span aria-hidden>·</span>
            <span>Edited {timeAgo(lastSaved || Date.now())}</span>
            <span aria-hidden>·</span>
            <span>
              {words} word{words === 1 ? "" : "s"}
            </span>
          </p>
          <div ref={host} className="note-editor" />
        </article>
      </main>
      <DrawingPicker
        open={picker}
        title="Link a whiteboard, board or note"
        kinds={["drawing", "board", "note"]}
        exclude={[useNote.getState().path]}
        onClose={() => setPicker(false)}
        onPick={(d) => {
          setPicker(false);
          if (viewRef.current) insertLink(viewRef.current, d.title);
        }}
      />
    </div>
  );
}

export default function NoteScreen({ path }: { path: string }) {
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await closeEditorIfOpen();
        const text = await api.drawingRead(path);
        const entry = allDocuments(useWorkspace.getState().tree).find((d) => d.path.toLowerCase() === path.toLowerCase());
        if (!alive) return;
        useNote.getState().open(path, text, entry?.modified ?? 0);
        setInitial(text);
        useWorkspace.getState().addRecent({ path, id: entry?.id ?? `path:${path}`, title: noteTitle(path) });
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
      void useNote.getState().flush();
    };
  }, [path]);

  if (error)
    return (
      <div className="dot-grid grid h-full place-items-center p-6">
        <div className="island max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto size-6 text-danger" />
          <p className="mt-3 font-[650]">This note could not be opened</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Button className="mt-4" onClick={() => useUI.getState().back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  if (initial === null)
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  return <NoteEditor path={path} initial={initial} />;
}
