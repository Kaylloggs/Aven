import { useMemo, useState, type ReactNode } from "react";
import {
  ArchiveRestore,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  LayoutGrid,
  LayoutTemplate,
  List,
  MoreHorizontal,
  Pin,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  AlertTriangle,
  FolderOpen,
  Clock,
  Inbox,
  Archive,
  FileText,
  Kanban,
} from "lucide-react";
import { Button, EmptyState, IconButton, Input, PROJECT_COLORS, Segmented, Select } from "@/components/ui";
import { openContextMenu, openMenuAt } from "@/components/Menu";
import { api, pickFile, pickFolder } from "@/platform/api";
import type { ProjectNode } from "@/platform/types";
import { allBoards, allDrawings, countDrawings, findFolder, flattenBoards, flattenFolder, inboxPath, useWorkspace, type DrawingRef } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { askConfirm, askText, toast, useUI } from "@/store/ui";
import { newBoard, newDrawing, newProject } from "@/features/commands";
import { parseDocument, serializeDocument } from "@/engine/format";
import { cx, errorMessage, formatDate, timeAgo } from "@/lib/utils";
import { basename, join, stem } from "@/lib/path";
import { Sidebar } from "./Sidebar";
import { FacetArt } from "@/components/FacetArt";
import { BoardCard, DrawingCard, DrawingTable, FolderCard, Thumbnail } from "./DrawingCard";
import { projectMenu } from "./actions";
import { dropProps } from "./dnd";
import { KnowledgeMap } from "./KnowledgeMap";

type Sort = "updated" | "created" | "name";

function sortDrawings(list: DrawingRef[], sort: Sort) {
  const l = [...list];
  if (sort === "name") l.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  else if (sort === "created") l.sort((a, b) => b.created - a.created);
  else l.sort((a, b) => b.updated - a.updated);
  return l;
}

function Page({ title, subtitle, actions, children, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <main className="dot-grid min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-10 pb-16 pt-9">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display flex items-center gap-3 text-[2.5rem] leading-[1.05]">
              {icon}
              <span className="truncate">{title}</span>
            </h1>
            {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}

function ViewControls({ sort, setSort, filter, setFilter }: { sort: Sort; setSort: (s: Sort) => void; filter: string; setFilter: (s: string) => void }) {
  const view = useSettings((s) => s.settings.appearance.homeView);
  const update = useSettings((s) => s.update);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input className="w-64" icon={<Search className="size-3.5" />} placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter drawings" />
      <div className="flex-1" />
      <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
        <option value="updated">Last modified</option>
        <option value="created">Date created</option>
        <option value="name">Name</option>
      </Select>
      <Segmented
        label="Layout"
        value={view}
        onChange={(v) => update({ appearance: { homeView: v } })}
        options={[
          { value: "grid", label: <LayoutGrid className="size-4" />, title: "Grid" },
          { value: "list", label: <List className="size-4" />, title: "List" },
        ]}
      />
    </div>
  );
}

function DrawingCollection({ drawings, showProject = true, empty }: { drawings: DrawingRef[]; showProject?: boolean; empty: ReactNode }) {
  const view = useSettings((s) => s.settings.appearance.homeView);
  if (!drawings.length) return <>{empty}</>;
  if (view === "list") return <DrawingTable drawings={drawings} showProject={showProject} />;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {drawings.map((d) => (
        <DrawingCard key={d.path} d={d} showProject={showProject} />
      ))}
    </div>
  );
}

function useFiltered(list: DrawingRef[]) {
  const [sort, setSort] = useState<Sort>("updated");
  const [filter, setFilter] = useState("");
  const items = useMemo(() => {
    const t = filter.toLowerCase().trim();
    return sortDrawings(t ? list.filter((d) => d.title.toLowerCase().includes(t)) : list, sort);
  }, [list, sort, filter]);
  return { items, controls: <ViewControls sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} /> };
}

function ProjectCard({ p }: { p: ProjectNode }) {
  const drawings = useMemo(() => flattenFolder(p.root, p).sort((a, b) => b.updated - a.updated), [p]);
  const cover = drawings.slice(0, 3);
  const open = () => useUI.getState().navigate({ name: "home", section: "project", projectPath: p.path, folderPath: p.path });
  return (
    <div className="group relative" onContextMenu={(e) => openContextMenu(e, projectMenu(p))} {...dropProps(p.path)}>
      <button type="button" onClick={open} style={{ ["--fold" as any]: PROJECT_COLORS[p.meta.color] ?? PROJECT_COLORS.coral }} className="fold lift w-full overflow-hidden rounded-2xl border border-border bg-surface text-left hover:border-border-strong cursor-pointer">
        <div className="grid aspect-[16/9] grid-cols-3 gap-px border-b border-border bg-border">
          {cover.length ? (
            cover.map((d, i) => <Thumbnail key={d.path} id={d.id} className={cx("h-full", i === 0 && cover.length < 3 ? "col-span-3" : i === 0 ? "col-span-2 row-span-2" : "")} />)
          ) : (
            <div className="col-span-3 grid place-items-center bg-surface-2">
              <span className="size-8 rounded-full opacity-80" style={{ background: PROJECT_COLORS[p.meta.color] }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="facet-dot" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-[650]">{p.meta.name}</span>
            <span className="block truncate text-xs text-faint">
              {drawings.length} drawing{drawings.length === 1 ? "" : "s"} · {drawings[0] ? timeAgo(drawings[0].updated) : `created ${formatDate(p.meta.createdAt)}`}
            </span>
          </span>
          {p.meta.pinned && <Pin className="size-3.5 text-faint" />}
          {p.meta.favorite && <Star className="size-3.5 fill-[var(--warning)] text-warning" />}
        </div>
      </button>
      <IconButton label="Project options" size="sm" className="absolute right-9 top-2 bg-raised opacity-0 shadow-[var(--shadow-sm)] group-hover:opacity-100 focus:opacity-100" onClick={(e) => openMenuAt(e.currentTarget, projectMenu(p), "end")}>
        <MoreHorizontal className="size-4" />
      </IconButton>
    </div>
  );
}

async function importDrawings(dir: string) {
  const files = await pickFile("Import drawings", [{ name: "Drawings", extensions: ["aven", "excalidraw", "json"] }], true);
  let n = 0;
  for (const f of files) {
    try {
      const doc = parseDocument(await api.fileReadText(f), stem(f));
      doc.id = crypto.randomUUID();
      await api.drawingCreate(dir, doc.title, serializeDocument(doc));
      n++;
    } catch (e) {
      toast({ kind: "error", title: `Could not import ${basename(f)}`, message: errorMessage(e) });
    }
  }
  if (n) {
    await useWorkspace.getState().refresh();
    toast({ kind: "success", title: `${n} drawing${n > 1 ? "s" : ""} imported` });
  }
}

async function importProject() {
  const [f] = await pickFile("Import project", [{ name: "Aven project", extensions: ["avenproject", "zip"] }]);
  if (!f) return;
  try {
    const p = await api.projectImport(useWorkspace.getState().active!.id, f);
    await useWorkspace.getState().refresh();
    useUI.getState().navigate({ name: "home", section: "project", projectPath: p, folderPath: p });
    toast({ kind: "success", title: "Project imported" });
  } catch (e) {
    toast({ kind: "error", title: "Import failed", message: errorMessage(e) });
  }
}

function CreateTiles({ dir, large }: { dir: string; large?: boolean }) {
  const tiles = [
    { art: "blank" as const, fold: "var(--facet-coral)", title: "Blank canvas", body: "Shapes, arrows, text and images on an infinite canvas.", run: (_el: HTMLElement) => void newDrawing(dir) },
    { art: "template" as const, fold: "var(--facet-blue)", title: "From a template", body: "40 editable starts: mind maps, roadmaps, wireframes and more.", run: (_el: HTMLElement) => useUI.getState().setOverlay({ kind: "templates", targetDir: dir }) },
    { art: "board" as const, fold: "var(--facet-green)", title: "Kanban board", body: "Columns and cards for tasks, sprints and content plans.", run: (el: HTMLElement) => void newBoard(dir, el) },
    { art: "project" as const, fold: "var(--facet-violet)", title: "New project", body: "Drawings, boards, folders and assets kept together.", run: () => void newProject() },
    { art: "import" as const, fold: "var(--facet-honey)", title: "Import", body: "Open .aven or .excalidraw files.", run: (_el: HTMLElement) => void importDrawings(dir) },
  ];
  return (
    <div className={cx("grid gap-4", large ? "md:grid-cols-3 xl:grid-cols-5" : "mb-10 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5")}>
      {tiles.map((c) => (
        <button
          key={c.title}
          onClick={(e) => c.run(e.currentTarget)}
          style={{ ["--fold" as any]: c.fold }}
          className={cx("fold lift group flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface text-left cursor-pointer hover:border-border-strong", large ? "flex-col items-start p-6" : "p-3.5")}
        >
          <span className={cx("grid shrink-0 place-items-center rounded-xl bg-surface-2", large ? "h-28 w-full" : "size-16")}>
            <FacetArt kind={c.art} className={cx("transition-transform duration-300 group-hover:scale-105", large ? "h-24" : "h-12")} />
          </span>
          <span className="min-w-0">
            <span className={cx("block font-[650] text-text", large ? "font-display text-lg" : "text-sm")}>{c.title}</span>
            <span className="mt-0.5 block text-xs text-muted">{c.body}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  const tree = useWorkspace((s) => s.tree)!;
  const recents = useWorkspace((s) => s.recents);
  const drawings = useMemo(() => allDrawings(tree), [tree]);
  const recentDrawings = useMemo(() => {
    const byPath = new Map(drawings.map((d) => [d.path.toLowerCase(), d]));
    const seen = recents.map((r) => byPath.get(r.path.toLowerCase())).filter(Boolean) as DrawingRef[];
    const rest = [...drawings].sort((a, b) => b.updated - a.updated).filter((d) => !seen.includes(d));
    return [...seen, ...rest].slice(0, 8);
  }, [drawings, recents]);
  const favorites = drawings.filter((d) => tree.state.favorites?.includes(d.id));
  const boards = useMemo(() => allBoards(tree).sort((a, b) => b.updated - a.updated), [tree]);
  const pinned = tree.projects.filter((p) => p.meta.pinned);
  const [projSort, setProjSort] = useState<"updated" | "name" | "created">("updated");
  const projects = useMemo(() => {
    const last = (p: ProjectNode) => Math.max(p.meta.updatedAt, ...flattenFolder(p.root, p).map((d) => d.updated));
    const l = [...tree.projects];
    if (projSort === "name") l.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
    else if (projSort === "created") l.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
    else l.sort((a, b) => last(b) - last(a));
    return l;
  }, [tree, projSort]);
  const empty = !drawings.length && !tree.projects.length && !boards.length;

  return (
    <Page
      title={tree.info.name}
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          {drawings.length} drawing{drawings.length === 1 ? "" : "s"} in {tree.projects.length} project{tree.projects.length === 1 ? "" : "s"}
          <button className="ml-1 inline-flex items-center text-faint hover:text-text cursor-pointer" aria-label="Refresh" data-tip="Rescan the workspace folder" onClick={() => void useWorkspace.getState().refresh()}>
            <RefreshCw className="size-3.5" />
          </button>
        </span>
      }
      actions={
        <>
          <Button icon={<Upload className="size-4" />} onClick={() => void importProject()}>
            Import project
          </Button>
          <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => void newDrawing(inboxPath(tree))}>
            New drawing
          </Button>
        </>
      }
    >
      {!empty && <CreateTiles dir={inboxPath(tree)} />}
      {empty ? (
        <CreateTiles dir={inboxPath(tree)} large />
      ) : (
        <div className="space-y-10">
          {pinned.length > 0 && (
            <section>
              <h2 className="font-display mb-3 text-lg">Pinned projects</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                {pinned.map((p) => (
                  <ProjectCard key={p.path} p={p} />
                ))}
              </div>
            </section>
          )}
          {recentDrawings.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg">Recently opened</h2>
                <button className="text-xs text-muted hover:text-text cursor-pointer" onClick={() => useUI.getState().navigate({ name: "home", section: "recent" })}>
                  View all
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {recentDrawings.map((d) => (
                  <DrawingCard key={d.path} d={d} />
                ))}
              </div>
            </section>
          )}
          {favorites.length > 0 && (
            <section>
              <h2 className="font-display mb-3 text-lg">Favorites</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {favorites.slice(0, 8).map((d) => (
                  <DrawingCard key={d.path} d={d} />
                ))}
              </div>
            </section>
          )}
          {boards.length > 0 && (
            <section>
              <h2 className="font-display mb-3 text-lg">Boards</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {boards.slice(0, 6).map((b) => (
                  <BoardCard key={b.path} d={b} />
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg">All projects</h2>
              <Select value={projSort} onChange={(e) => setProjSort(e.target.value as any)} aria-label="Sort projects">
                <option value="updated">Recently active</option>
                <option value="name">Name</option>
                <option value="created">Date created</option>
              </Select>
            </div>
            {projects.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                {projects.map((p) => (
                  <ProjectCard key={p.path} p={p} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<FolderPlus className="size-5" />} title="No projects yet" body="Projects keep drawings, folders and assets together." action={<Button onClick={() => void newProject()}>New project</Button>} />
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

function ProjectView({ projectPath, folderPath }: { projectPath: string; folderPath: string }) {
  const tree = useWorkspace((s) => s.tree)!;
  const project = tree.projects.find((p) => p.path === projectPath);
  const folder = project ? findFolder(project.root, folderPath) ?? project.root : null;
  const list = useMemo(() => (folder && project ? folder.drawings.map((d) => ({ ...d, project, folderPath: folder.path })) : []), [folder, project]);
  const { items, controls } = useFiltered(list);
  if (!project || !folder)
    return (
      <Page title="Project not found">
        <EmptyState icon={<AlertTriangle className="size-5" />} title="This project is no longer here" body="It may have been moved, renamed or deleted outside Aven." action={<Button onClick={() => useUI.getState().navigate({ name: "home", section: "home" })}>Back home</Button>} />
      </Page>
    );
  const crumbs: { name: string; path: string }[] = [];
  const rel = folder.path.slice(project.path.length).split("\\").filter(Boolean);
  let acc = project.path;
  for (const r of rel) {
    acc = join(acc, r);
    crumbs.push({ name: r, path: acc });
  }
  const goFolder = (p: string) => useUI.getState().navigate({ name: "home", section: "project", projectPath, folderPath: p });
  return (
    <Page
      icon={<span className="size-3.5 rounded-full" style={{ background: PROJECT_COLORS[project.meta.color] }} />}
      title={
        <span className="flex items-center gap-2">
          <button className={cx("cursor-pointer", crumbs.length && "text-muted hover:text-text")} onClick={() => goFolder(project.path)} {...dropProps(project.path)}>
            {project.meta.name}
          </button>
          {crumbs.map((c) => (
            <span key={c.path} className="flex items-center gap-2">
              <ChevronRight className="size-5 text-faint" />
              <button className="cursor-pointer hover:text-text" onClick={() => goFolder(c.path)} {...dropProps(c.path)}>
                {c.name}
              </button>
            </span>
          ))}
        </span>
      }
      subtitle={
        <button
          className="text-left hover:text-text cursor-pointer"
          onClick={async () => {
            const d = await askText({ title: "Project description", initial: project.meta.description, placeholder: "What is this project about?", confirmLabel: "Save" });
            if (d !== null) await useWorkspace.getState().updateProject(project.path, { description: d });
          }}
        >
          {project.meta.description || <span className="text-faint">Add a description</span>}
        </button>
      }
      actions={
        <>
          <IconButton label={project.meta.favorite ? "Remove from favorites" : "Add to favorites"} active={project.meta.favorite} onClick={() => void useWorkspace.getState().updateProject(project.path, { favorite: !project.meta.favorite })}>
            <Star className={cx("size-4", project.meta.favorite && "fill-current")} />
          </IconButton>
          <IconButton label={project.meta.pinned ? "Unpin" : "Pin to top"} active={project.meta.pinned} onClick={() => void useWorkspace.getState().updateProject(project.path, { pinned: !project.meta.pinned })}>
            <Pin className="size-4" />
          </IconButton>
          <IconButton label="Project options" onClick={(e) => openMenuAt(e.currentTarget, projectMenu(project), "end")}>
            <MoreHorizontal className="size-4" />
          </IconButton>
          <Button icon={<Upload className="size-4" />} onClick={() => void importDrawings(folder.path)}>
            Import
          </Button>
          <Button
            icon={<FolderPlus className="size-4" />}
            onClick={async () => {
              const n = await askText({ title: "New folder", label: "Folder name", initial: "New folder", confirmLabel: "Create folder" });
              if (n) await useWorkspace.getState().createFolder(folder.path, n);
            }}
          >
            New folder
          </Button>
          <Button icon={<LayoutTemplate className="size-4" />} onClick={() => useUI.getState().setOverlay({ kind: "templates", targetDir: folder.path })}>
            From template
          </Button>
          <Button icon={<Kanban className="size-4" />} onClick={(e) => void newBoard(folder.path, e.currentTarget)}>
            New board
          </Button>
          <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => void newDrawing(folder.path)}>
            New drawing
          </Button>
        </>
      }
    >
      {folder.folders.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg">Folders</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {folder.folders.map((f) => (
              <FolderCard key={f.path} f={f} />
            ))}
          </div>
        </section>
      )}
      {folder.boards.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg">Boards</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {folder.boards.map((b) => (
              <BoardCard key={b.path} d={{ ...b, project, folderPath: folder.path }} showProject={false} />
            ))}
          </div>
        </section>
      )}
      {folder.assets.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg">Assets</h2>
          <div className="flex flex-wrap gap-2">
            {folder.assets.map((a) => (
              <span key={a.path} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted">
                <FileText className="size-3.5" /> {a.name}
              </span>
            ))}
          </div>
        </section>
      )}
      <h2 className="font-display mb-3 text-lg">Drawings</h2>
      {controls}
      <DrawingCollection
        drawings={items}
        showProject={false}
        empty={
          <EmptyState
            icon={<FilePlus2 className="size-5" />}
            title={countDrawings(folder) ? "No drawings directly in this folder" : "This project is empty"}
            body="Create a drawing, start from a template, or drag drawings here from elsewhere."
            action={
              <>
                <Button variant="primary" onClick={() => void newDrawing(folder.path)}>
                  New drawing
                </Button>
                <Button onClick={() => useUI.getState().setOverlay({ kind: "templates", targetDir: folder.path })}>From template</Button>
              </>
            }
          />
        }
      />
    </Page>
  );
}

function RecentView() {
  const tree = useWorkspace((s) => s.tree)!;
  const recents = useWorkspace((s) => s.recents);
  const list = useMemo(() => {
    const byPath = new Map(allDrawings(tree).map((d) => [d.path.toLowerCase(), d]));
    return recents.map((r) => byPath.get(r.path.toLowerCase())).filter(Boolean) as DrawingRef[];
  }, [tree, recents]);
  const view = useSettings((s) => s.settings.appearance.homeView);
  return (
    <Page title="Recent" subtitle="Drawings you opened most recently">
      {list.length === 0 ? (
        <EmptyState icon={<Clock className="size-5" />} title="Nothing opened yet" body="Drawings you open show up here." />
      ) : view === "list" ? (
        <DrawingTable drawings={list} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {list.map((d) => (
            <DrawingCard key={d.path} d={d} />
          ))}
        </div>
      )}
    </Page>
  );
}

function FavoritesView() {
  const tree = useWorkspace((s) => s.tree)!;
  const drawings = useMemo(() => allDrawings(tree).filter((d) => tree.state.favorites?.includes(d.id)), [tree]);
  const projects = tree.projects.filter((p) => p.meta.favorite);
  const { items, controls } = useFiltered(drawings);
  return (
    <Page title="Favorites">
      {projects.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg">Projects</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.path} p={p} />
            ))}
          </div>
        </section>
      )}
      <h2 className="font-display mb-3 text-lg">Drawings</h2>
      {controls}
      <DrawingCollection drawings={items} empty={<EmptyState icon={<Star className="size-5" />} title="No favorite drawings" body="Use the star in a drawing's menu to keep it here." />} />
    </Page>
  );
}

function InboxView() {
  const tree = useWorkspace((s) => s.tree)!;
  const list = useMemo(() => flattenFolder(tree.inbox, null), [tree]);
  const { items, controls } = useFiltered(list);
  return (
    <Page
      title="Drawings"
      subtitle="Drawings that are not part of a project"
      actions={
        <>
          <Button icon={<Upload className="size-4" />} onClick={() => void importDrawings(inboxPath(tree))}>
            Import
          </Button>
          <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => void newDrawing(inboxPath(tree))}>
            New drawing
          </Button>
        </>
      }
    >
      {tree.inbox.boards.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg">Boards</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {flattenBoards(tree.inbox, null).map((b) => (
              <BoardCard key={b.path} d={b} showProject={false} />
            ))}
          </div>
        </section>
      )}
      {controls}
      <DrawingCollection drawings={items} showProject={false} empty={<EmptyState icon={<Inbox className="size-5" />} title="No loose drawings" body="Quick drawings land here until you move them into a project." />} />
    </Page>
  );
}

function ArchivesView() {
  const tree = useWorkspace((s) => s.tree)!;
  return (
    <Page title="Archives" subtitle="Finished or paused projects. They stay searchable and can be restored any time.">
      {tree.archives.length === 0 ? (
        <EmptyState icon={<Archive className="size-5" />} title="No archived projects" body="Archive a project from its menu to tidy your sidebar without deleting anything." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {tree.archives.map((p) => (
            <div key={p.path} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0" onContextMenu={(e) => openContextMenu(e, projectMenu(p))}>
              <span className="size-2.5 rounded-full" style={{ background: PROJECT_COLORS[p.meta.color] }} />
              <span className="flex-1 truncate text-sm">{p.meta.name}</span>
              <span className="text-xs text-faint">{countDrawings(p.root)} drawings</span>
              <Button size="sm" icon={<ArchiveRestore className="size-3.5" />} onClick={() => void useWorkspace.getState().setArchived(p.path, false)}>
                Restore
              </Button>
              <IconButton label="More" size="sm" onClick={(e) => openMenuAt(e.currentTarget, projectMenu(p), "end")}>
                <MoreHorizontal className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function TrashView() {
  const tree = useWorkspace((s) => s.tree)!;
  const wsId = tree.info.id;
  const days = useSettings((s) => s.settings.workspace.trashRetentionDays);
  const restore = async (id: string) => {
    try {
      const p = await api.trashRestore(wsId, id);
      await useWorkspace.getState().refresh();
      toast({ kind: "success", title: "Restored", message: p });
    } catch (e) {
      toast({ kind: "error", title: "Could not restore", message: errorMessage(e) });
    }
  };
  const purge = async (id?: string) => {
    const ok = await askConfirm({
      title: id ? "Delete permanently?" : "Empty the trash?",
      message: id ? "This item will be deleted from your disk. This cannot be undone." : `All ${tree.trash.length} items will be deleted from your disk. This cannot be undone.`,
      confirmLabel: id ? "Delete permanently" : "Empty trash",
      danger: true,
    });
    if (!ok) return;
    await api.trashPurge(wsId, id);
    await useWorkspace.getState().refresh();
  };
  return (
    <Page
      title="Trash"
      subtitle={days > 0 ? `Items are deleted permanently after ${days} days.` : "Items stay here until you empty the trash."}
      actions={
        tree.trash.length > 0 && (
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void purge()}>
            Empty trash
          </Button>
        )
      }
    >
      {tree.trash.length === 0 ? (
        <EmptyState icon={<Trash2 className="size-5" />} title="Trash is empty" body="Deleted drawings, folders and projects wait here so they can be restored." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {tree.trash.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              {t.kind === "drawing" ? <FileText className="size-4 text-faint" /> : <FolderOpen className="size-4 text-faint" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{t.name.replace(/\.aven$/i, "")}</span>
                <span className="block truncate text-xs text-faint">
                  {t.kind} · from {t.originalPath.split("\\").slice(0, -1).join(" › ") || "workspace"} · deleted {timeAgo(t.deletedAt)}
                </span>
              </span>
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => void restore(t.id)}>
                Restore
              </Button>
              <IconButton label="Delete permanently" size="sm" onClick={() => void purge(t.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function MissingWorkspace() {
  const active = useWorkspace((s) => s.active);
  const error = useWorkspace((s) => s.error);
  return (
    <main className="grid flex-1 place-items-center p-8">
      <div className="max-w-md text-center anim-pop">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-danger-soft text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="text-lg">Workspace not available</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <p className="mt-1 break-all text-xs text-faint">{active?.path}</p>
        <p className="mt-3 text-sm text-muted">If you moved the folder or it is on a disconnected drive, reconnect it or point Aven to its new location. Nothing has been deleted.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => void useWorkspace.getState().refresh()}>Try again</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const p = await pickFolder("Where is the workspace folder now?");
              if (p) await useWorkspace.getState().openFolder(p);
            }}
          >
            Locate folder…
          </Button>
        </div>
        <button className="mt-4 text-xs text-muted hover:text-text cursor-pointer" onClick={() => active && void useWorkspace.getState().forget(active.id)}>
          Remove it from the workspace list
        </button>
      </div>
    </main>
  );
}

export function HomeScreen() {
  const route = useUI((s) => s.route);
  const tree = useWorkspace((s) => s.tree);
  const error = useWorkspace((s) => s.error);
  const section = route.name === "home" ? route.section : "home";
  let content: ReactNode;
  if (error || !tree) content = <MissingWorkspace />;
  else if (section === "project" && route.name === "home" && route.projectPath) content = <ProjectView projectPath={route.projectPath} folderPath={route.folderPath ?? route.projectPath} />;
  else if (section === "recent") content = <RecentView />;
  else if (section === "favorites") content = <FavoritesView />;
  else if (section === "inbox") content = <InboxView />;
  else if (section === "archives") content = <ArchivesView />;
  else if (section === "trash") content = <TrashView />;
  else if (section === "graph") content = <KnowledgeMap />;
  else content = <Dashboard />;
  return (
    <div className="flex h-full bg-canvas">
      <Sidebar />
      {content}
    </div>
  );
}

