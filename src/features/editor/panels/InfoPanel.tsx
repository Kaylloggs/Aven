import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy, CornerDownLeft, FileText, Link2, Plus, X } from "lucide-react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { api } from "@/platform/api";
import type { LinkRow } from "@/platform/types";
import { drawingLink, extractLinkTargets } from "@/engine/format";
import { allDrawings, projectFor, useWorkspace, type DrawingRef } from "@/store/workspace";
import { openDrawing, toast } from "@/store/ui";
import { Button, IconButton, Input, TextArea } from "@/components/ui";
import { DrawingPicker } from "@/features/overlays/DrawingPicker";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { useEditor } from "../session";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-xs">
      <span className="text-faint">{label}</span>
      <span className="truncate text-right text-muted">{children}</span>
    </div>
  );
}

async function go(path: string) {
  await useEditor.getState().session?.flush();
  openDrawing(path);
}

export function InfoPanel() {
  const session = useEditor((s) => s.session);
  const path = useEditor((s) => s.path);
  const meta = useEditor((s) => s.meta);
  const links = useEditor((s) => s.links);
  const selection = useEditor((s) => s.selection);
  const tree = useWorkspace((s) => s.tree);
  const [backlinks, setBacklinks] = useState<LinkRow[]>([]);
  const [picker, setPicker] = useState<null | "doc" | "element">(null);
  const [tag, setTag] = useState("");
  const [desc, setDesc] = useState(meta.description);
  useEffect(() => setDesc(meta.description), [meta.description]);

  const drawings = useMemo(() => allDrawings(tree, true), [tree]);
  const entry = drawings.find((d) => d.path.toLowerCase() === path.toLowerCase());
  const project = projectFor(tree, path);
  const docId = session?.doc.id;

  useEffect(() => {
    if (docId) api.linksBacklinks(docId).then(setBacklinks).catch(() => setBacklinks([]));
  }, [docId, path]);

  if (!session) return null;
  const outgoing = extractLinkTargets(session.buildDocument())
    .map((t) => ({ ...t, target: drawings.find((d) => d.id === t.id) }))
    .filter((t) => t.id !== docId);

  const addDocLink = (d: DrawingRef) => {
    if (links.some((l) => l.id === d.id)) return;
    session.setLinks([...links, { id: d.id, kind: "drawing", label: d.title }]);
  };
  const linkElement = (d: DrawingRef) => {
    const a = session.api!;
    const ids = new Set(selection);
    a.updateScene({
      elements: a.getSceneElements().map((e) => (ids.has(e.id) ? { ...e, link: drawingLink(d.id), version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31) } : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    toast({ kind: "success", title: `Linked to “${d.title}”`, message: "Click the link icon on the shape to open it." });
  };

  return (
    <div className="space-y-5 p-4">
      <section>
        <Row label="Project">{project?.meta.name ?? "No project"}</Row>
        {entry && <Row label="Created">{formatDateTime(entry.created)}</Row>}
        {entry && <Row label="Modified">{formatDateTime(entry.updated)}</Row>}
        {entry && <Row label="Size">{formatBytes(entry.size)}</Row>}
        <p className="mt-2 break-all text-2xs text-faint">{path}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-[600] text-muted">Description</h3>
        <TextArea
          value={desc}
          placeholder="What is this drawing about?"
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== meta.description && session.setMeta({ ...meta, description: desc })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-[600] text-muted">Tags</h3>
        <div className="flex flex-wrap gap-1.5">
          {meta.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs">
              {t}
              <button aria-label={`Remove tag ${t}`} className="text-faint hover:text-text cursor-pointer" onClick={() => session.setMeta({ ...meta, tags: meta.tags.filter((x) => x !== t) })}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tag.trim().replace(/^#/, "");
            if (t && !meta.tags.includes(t)) session.setMeta({ ...meta, tags: [...meta.tags, t] });
            setTag("");
          }}
        >
          <Input value={tag} placeholder="Add a tag and press Enter" onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Add tag" />
        </form>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-[600] text-muted">Links from this drawing</h3>
          <IconButton label="Link another drawing" size="sm" onClick={() => setPicker("doc")}>
            <Plus className="size-3.5" />
          </IconButton>
        </div>
        {outgoing.length === 0 && <p className="text-xs text-faint">No links yet. Link related drawings to build your map of ideas.</p>}
        <ul className="space-y-0.5">
          {outgoing.map((l) => (
            <li key={l.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
              <FileText className="size-3.5 text-faint shrink-0" />
              <button className="flex-1 truncate text-left cursor-pointer disabled:cursor-default disabled:text-faint" disabled={!l.target} onClick={() => l.target && go(l.target.path)}>
                {l.target?.title ?? "Missing drawing"}
              </button>
              {links.some((x) => x.id === l.id) && (
                <IconButton label="Remove link" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => session.setLinks(links.filter((x) => x.id !== l.id))}>
                  <X className="size-3.5" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" icon={<Link2 className="size-3.5" />} disabled={!selection.length} onClick={() => setPicker("element")}>
            Link selection to a drawing
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(drawingLink(session.doc.id));
              toast({ kind: "success", title: "Link copied", message: "Paste it as a shape link (Ctrl+K) in any drawing." });
            }}
          >
            Copy link
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-[600] text-muted">Linked from</h3>
        {backlinks.length === 0 ? (
          <p className="text-xs text-faint">No other drawing links here yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((b) => (
              <li key={b.sourceId}>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover cursor-pointer" onClick={() => go(b.sourcePath)}>
                  <CornerDownLeft className="size-3.5 text-faint" />
                  <span className="flex-1 truncate">{b.sourceTitle}</span>
                  <ArrowUpRight className="size-3.5 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DrawingPicker
        open={!!picker}
        title={picker === "element" ? "Link the selection to…" : "Link to drawing…"}
        exclude={docId ? [docId] : []}
        onClose={() => setPicker(null)}
        onPick={(d) => {
          if (picker === "element") linkElement(d);
          else addDocLink(d);
          setPicker(null);
        }}
      />
    </div>
  );
}
