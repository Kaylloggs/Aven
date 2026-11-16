import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Download, LayoutTemplate, MoreHorizontal, Search, Sparkles, Star, Upload, User } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, EmptyState, IconButton, Input, Select } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { api } from "@/platform/api";
import { parseDocument } from "@/engine/format";
import type { DrawingEntry, FolderNode } from "@/platform/types";
import { inboxPath, useWorkspace } from "@/store/workspace";
import { askConfirm, openDrawing, useUI } from "@/store/ui";
import { closeEditorIfOpen } from "@/features/commands";
import { cx } from "@/lib/utils";
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES, type TemplateDef } from "./builtin";
import {
  buildTemplateDocument,
  createFromBuiltin,
  createFromCustom,
  customizeBuiltin,
  exportTemplate,
  exportTemplatePack,
  importTemplates,
  templatePreview,
} from "./templateActions";

type Entry = { kind: "builtin"; def: TemplateDef; key: string } | { kind: "custom"; entry: DrawingEntry; category: string; key: string };
type View = "recommended" | "recent" | "favorites" | "mine" | string;

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

function Thumb({ entry, large }: { entry: Entry; large?: boolean }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!seen) return;
    let alive = true;
    const load = entry.kind === "builtin" ? () => buildTemplateDocument(entry.def) : async () => parseDocument(await api.drawingRead(entry.entry.path));
    templatePreview(`${entry.key}@${entry.kind === "custom" ? entry.entry.modified : 0}`, load).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [seen, entry]);
  return (
    <div ref={ref} className={cx("grid place-items-center overflow-hidden rounded-lg border border-border bg-white", large ? "aspect-[16/10]" : "aspect-[4/3]")}>
      {src ? <img src={src} alt="" draggable={false} className="max-h-full max-w-full object-contain p-2" /> : <div className="skeleton h-full w-full opacity-40" />}
    </div>
  );
}

function folderOptions(f: FolderNode, depth: number, out: { path: string; label: string }[]) {
  for (const sub of f.folders) {
    out.push({ path: sub.path, label: `${"   ".repeat(depth)}${sub.name}` });
    folderOptions(sub, depth + 1, out);
  }
}

export function TemplateGallery({ targetDir }: { targetDir?: string }) {
  const close = () => useUI.getState().setOverlay(null);
  const tree = useWorkspace((s) => s.tree);
  const saveState = useWorkspace((s) => s.saveState);
  const [view, setView] = useState<View>("recommended");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Entry | null>(null);
  const [dest, setDest] = useState(targetDir ?? (tree ? inboxPath(tree) : ""));
  const [name, setName] = useState("");
  const favorites = new Set(tree?.state.templateFavorites ?? []);
  const recent = tree?.state.recentTemplates ?? [];

  const entries = useMemo<Entry[]>(() => {
    const builtin = BUILTIN_TEMPLATES.map<Entry>((def) => ({ kind: "builtin", def, key: def.id }));
    const custom = (tree?.templates ?? []).map<Entry>((e) => ({ kind: "custom", entry: e, key: e.id, category: e.path.split("\\").slice(-2, -1)[0] ?? "Custom" }));
    return [...custom, ...builtin];
  }, [tree]);

  const nameOf = (e: Entry) => (e.kind === "builtin" ? e.def.name : e.entry.title);
  const visible = entries.filter((e) => {
    const t = q.toLowerCase().trim();
    if (t) {
      const hay = e.kind === "builtin" ? `${e.def.name} ${e.def.description} ${e.def.tags.join(" ")} ${e.def.category}` : `${e.entry.title} ${e.category}`;
      return hay.toLowerCase().includes(t);
    }
    if (view === "recommended") return e.kind === "builtin" && e.def.recommended;
    if (view === "recent") return recent.includes(e.key);
    if (view === "favorites") return favorites.has(e.key);
    if (view === "mine") return e.kind === "custom";
    return e.kind === "builtin" && e.def.category === view;
  });
  if (view === "recent") visible.sort((a, b) => recent.indexOf(a.key) - recent.indexOf(b.key));

  const destinations = useMemo(() => {
    const out: { path: string; label: string }[] = [];
    if (!tree) return out;
    out.push({ path: inboxPath(tree), label: "Drawings (no project)" });
    for (const p of tree.projects) {
      out.push({ path: p.path, label: p.meta.name });
      folderOptions(p.root, 1, out);
    }
    return out;
  }, [tree]);

  const toggleFav = (key: string) => {
    const next = new Set(favorites);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void saveState({ templateFavorites: [...next] });
  };

  const use = async (e: Entry) => {
    close();
    if (e.kind === "builtin") await createFromBuiltin(e.def, dest, name.trim() || undefined);
    else await createFromCustom(e.entry.path, dest, name.trim() || undefined);
  };

  const menu = (el: HTMLElement, e: Entry) =>
    openMenuAt(el, [
      { label: "Use template", onSelect: () => setPicked(e) },
      ...(e.kind === "builtin"
        ? [
            { label: "Customize a copy", onSelect: () => { close(); void customizeBuiltin(e.def); } },
            { label: "Export…", onSelect: () => void exportTemplate({ builtin: e.def }) },
          ]
        : [
            { label: "Edit template", onSelect: async () => { close(); await closeEditorIfOpen(); openDrawing(e.entry.path); } },
            { label: "Duplicate", onSelect: () => void useWorkspace.getState().duplicate(e.entry.path) },
            { label: "Export…", onSelect: () => void exportTemplate({ path: e.entry.path }) },
            "separator" as const,
            {
              label: "Delete template",
              danger: true,
              onSelect: async () => {
                if (await askConfirm({ title: `Delete “${e.entry.title}”?`, message: "It moves to the workspace trash and can be restored.", confirmLabel: "Delete", danger: true }))
                  await useWorkspace.getState().trash(e.entry.path, e.entry.title);
              },
            },
          ]),
    ]);

  const nav: { id: View; label: string; icon?: React.ReactNode; count?: number }[] = [
    { id: "recommended", label: "Recommended", icon: <Sparkles className="size-4" /> },
    { id: "recent", label: "Recently used", icon: <Clock className="size-4" />, count: recent.length },
    { id: "favorites", label: "Favorites", icon: <Star className="size-4" />, count: favorites.size },
    { id: "mine", label: "My templates", icon: <User className="size-4" />, count: tree?.templates.length ?? 0 },
  ];

  return (
    <Modal open onClose={close} bare width={1120}>
      <div className="flex h-[min(760px,calc(100vh-48px))]">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-2 p-3">
          <h2 className="px-2 pb-3 pt-1 text-md">Templates</h2>
          {nav.map((n) => (
            <button key={n.id} onClick={() => { setView(n.id); setPicked(null); setQ(""); }} className={cx("flex h-8 items-center gap-2.5 rounded-md px-2 text-sm cursor-pointer", view === n.id && !q ? "bg-accent-soft text-text" : "text-muted hover:bg-hover hover:text-text")}>
              {n.icon}
              <span className="flex-1 text-left">{n.label}</span>
              {!!n.count && <span className="text-2xs text-faint">{n.count}</span>}
            </button>
          ))}
          <p className="px-2 pb-1 pt-4 text-2xs font-[600] text-faint">Categories</p>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button key={c} onClick={() => { setView(c); setPicked(null); setQ(""); }} className={cx("flex h-8 items-center rounded-md px-2 text-sm cursor-pointer", view === c && !q ? "bg-accent-soft text-text" : "text-muted hover:bg-hover hover:text-text")}>
              <span className="flex-1 text-left">{c}</span>
              <span className="text-2xs text-faint">{BUILTIN_TEMPLATES.filter((t) => t.category === c).length}</span>
            </button>
          ))}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => void importTemplates()}>
            Import templates
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => void exportTemplatePack()}>
            Export my templates
          </Button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {picked ? (
            <div className="flex min-h-0 flex-1 flex-col anim-fade">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <IconButton label="Back to templates" onClick={() => setPicked(null)}>
                  <ArrowLeft className="size-4" />
                </IconButton>
                <h3 className="text-md">{nameOf(picked)}</h3>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-6 overflow-auto p-6">
                <Thumb entry={picked} large />
                <div className="space-y-4">
                  <p className="text-sm text-muted">{picked.kind === "builtin" ? picked.def.description : `Personal template · ${picked.category}`}</p>
                  {picked.kind === "builtin" && (
                    <div className="flex flex-wrap gap-1.5">
                      {picked.def.tags.map((t) => (
                        <span key={t} className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-[550] text-muted">Drawing name</span>
                    <Input value={name} placeholder={nameOf(picked)} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-[550] text-muted">Save in</span>
                    <Select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full" aria-label="Destination">
                      {destinations.map((d) => (
                        <option key={d.path} value={d.path}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button variant="primary" className="w-full" onClick={() => use(picked)}>
                    Create drawing
                  </Button>
                  <p className="text-xs text-faint">Everything in the template is editable: move, restyle or delete any part.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Input autoFocus className="flex-1" icon={<Search className="size-3.5" />} placeholder="Search 40+ templates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {visible.length === 0 ? (
                  <EmptyState
                    icon={<LayoutTemplate className="size-5" />}
                    title={view === "mine" ? "No personal templates yet" : view === "favorites" ? "No favorites yet" : view === "recent" ? "Nothing used yet" : "No templates match"}
                    body={view === "mine" ? "Open any drawing and choose More › Save as template, or import templates." : view === "favorites" ? "Star the templates you use most." : undefined}
                  />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                    {visible.map((e) => (
                      <div key={`${e.kind}:${e.key}`} className="group relative">
                        <button onClick={() => setPicked(e)} className="w-full rounded-xl p-1.5 text-left transition-colors hover:bg-hover cursor-pointer">
                          <Thumb entry={e} />
                          <div className="px-1 pb-1 pt-2">
                            <p className="truncate text-sm font-[550] text-text">{nameOf(e)}</p>
                            <p className="truncate text-xs text-faint">{e.kind === "builtin" ? e.def.category : `My templates · ${e.category}`}</p>
                          </div>
                        </button>
                        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <IconButton label={favorites.has(e.key) ? "Remove from favorites" : "Add to favorites"} size="sm" className="bg-raised shadow-[var(--shadow-sm)]" onClick={() => toggleFav(e.key)}>
                            <Star className={cx("size-3.5", favorites.has(e.key) && "fill-[var(--warning)] text-warning")} />
                          </IconButton>
                          <IconButton label="Template options" size="sm" className="bg-raised shadow-[var(--shadow-sm)]" onClick={(ev) => menu(ev.currentTarget, e)}>
                            <MoreHorizontal className="size-3.5" />
                          </IconButton>
                        </div>
                        {favorites.has(e.key) && <Star className="pointer-events-none absolute left-4 top-4 size-3.5 fill-[var(--warning)] text-warning group-hover:opacity-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
