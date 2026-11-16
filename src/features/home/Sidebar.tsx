import { useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Inbox,
  LayoutTemplate,
  Network,
  Pin,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Check,
  FolderPlus,
  Plug,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { IconButton, PROJECT_COLORS } from "@/components/ui";
import { openContextMenu, openMenuAt } from "@/components/Menu";
import { pickFolder } from "@/platform/api";
import type { FolderNode, ProjectNode } from "@/platform/types";
import { inboxPath, useWorkspace } from "@/store/workspace";
import { askText, useUI, type HomeSection } from "@/store/ui";
import { useSettings } from "@/store/settings";
import { newProject } from "@/features/commands";
import { cx, shortcutLabel } from "@/lib/utils";
import { projectMenu, folderMenu } from "./actions";
import { dropProps } from "./dnd";

function NavItem({ icon, label, active, onClick, count, drop, tint = "var(--accent)" }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; count?: number; drop?: string; tint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...(drop ? dropProps(drop) : {})}
      style={{ ["--fold" as any]: tint }}
      className={cx(
        "group relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors cursor-pointer",
        active ? "bg-surface-2 text-text font-[600] shadow-[var(--shadow-sm)]" : "text-muted hover:bg-hover hover:text-text",
      )}
    >
      {active && <span aria-hidden className="facet-dot absolute -left-1 top-1/2 -translate-y-1/2 rotate-90" />}
      <span className={cx("[&>svg]:size-4 transition-colors", active ? "text-[var(--fold)]" : "opacity-80 group-hover:text-[var(--fold)]")}>{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {!!count && <span className="text-2xs text-faint tabular-nums">{count}</span>}
    </button>
  );
}

function FolderTree({ folder, depth, currentFolder }: { folder: FolderNode; depth: number; currentFolder?: string }) {
  return (
    <ul>
      {folder.folders.map((f) => (
        <FolderBranch key={f.path} f={f} depth={depth} currentFolder={currentFolder} />
      ))}
    </ul>
  );
}

function FolderBranch({ f, depth, currentFolder }: { f: FolderNode; depth: number; currentFolder?: string }) {
  const [open, setOpen] = useState(false);
  const active = currentFolder?.toLowerCase() === f.path.toLowerCase();
  const route = useUI((s) => s.route);
  return (
    <li>
      <div
        {...dropProps(f.path)}
        onContextMenu={(e) => openContextMenu(e, folderMenu(f))}
        style={{ paddingLeft: depth * 14 }}
        className={cx("flex h-7 items-center rounded-md text-sm", active ? "bg-accent-soft text-text" : "text-muted hover:bg-hover hover:text-text")}
      >
        <button aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className={cx("grid size-6 place-items-center cursor-pointer", !f.folders.length && "invisible")}>
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-left cursor-pointer"
          onClick={() => route.name === "home" && useUI.getState().navigate({ name: "home", section: "project", projectPath: route.projectPath, folderPath: f.path })}
        >
          {active ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className="size-3.5 shrink-0" />}
          <span className="truncate">{f.name}</span>
        </button>
      </div>
      {open && <FolderTree folder={f} depth={depth + 1} currentFolder={currentFolder} />}
    </li>
  );
}

function ProjectItem({ p, active, currentFolder }: { p: ProjectNode; active: boolean; currentFolder?: string }) {
  const [open, setOpen] = useState(active);
  const nav = () => useUI.getState().navigate({ name: "home", section: "project", projectPath: p.path, folderPath: p.path });
  return (
    <li>
      <div
        {...dropProps(p.path)}
        onContextMenu={(e) => openContextMenu(e, projectMenu(p))}
        className={cx("group flex h-8 items-center rounded-md text-sm", active && currentFolder?.toLowerCase() === p.path.toLowerCase() ? "bg-accent-soft text-text font-[550]" : "text-muted hover:bg-hover hover:text-text")}
      >
        <button aria-label={open ? "Collapse project" : "Expand project"} onClick={() => setOpen(!open)} className={cx("grid size-6 shrink-0 place-items-center cursor-pointer", !p.root.folders.length && "invisible")}>
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <button onClick={nav} className="flex min-w-0 flex-1 items-center gap-2.5 pr-2 text-left cursor-pointer">
          <span className="facet-dot" style={{ ["--fold" as any]: PROJECT_COLORS[p.meta.color] ?? PROJECT_COLORS.coral }} />
          <span className="truncate">{p.meta.name}</span>
          {p.meta.pinned && <Pin className="ml-auto size-3 shrink-0 text-faint" />}
        </button>
      </div>
      {open && <FolderTree folder={p.root} depth={1} currentFolder={currentFolder} />}
    </li>
  );
}

function WorkspaceSwitcher() {
  const registry = useWorkspace((s) => s.registry);
  const active = useWorkspace((s) => s.active);
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-hover cursor-pointer"
      onClick={(e) =>
        openMenuAt(e.currentTarget, [
          { heading: "Workspaces" },
          ...registry.workspaces.map((w) => ({
            label: w.name,
            hint: w.available ? undefined : "missing",
            disabled: !w.available,
            icon: w.id === active?.id ? <Check className="size-4" /> : <HardDrive className="size-4" />,
            onSelect: () => void useWorkspace.getState().switchTo(w.id),
          })),
          "separator",
          {
            label: "New workspace…",
            icon: <FolderPlus className="size-4" />,
            onSelect: async () => {
              const name = await askText({ title: "New workspace", label: "Name", initial: "My workspace", confirmLabel: "Choose location" });
              if (!name) return;
              const parent = await pickFolder("Where should the workspace folder be created?");
              if (parent) await useWorkspace.getState().createWorkspace(name, parent);
            },
          },
          {
            label: "Open folder as workspace…",
            icon: <FolderOpen className="size-4" />,
            onSelect: async () => {
              const p = await pickFolder("Choose a folder to use as a workspace");
              if (p) await useWorkspace.getState().openFolder(p);
            },
          },
          { label: "Manage workspaces", icon: <Settings className="size-4" />, onSelect: () => useUI.getState().navigate({ name: "settings", tab: "workspace" }) },
        ])
      }
    >
      <LogoMark size={26} />
      <span className="min-w-0 flex-1">
        <span className="font-display block truncate text-md text-text">{active?.name ?? "Aven"}</span>
        <span className="block truncate text-2xs text-faint">Workspace</span>
      </span>
      <ChevronDown className="size-3.5 text-faint" />
    </button>
  );
}

export function Sidebar() {
  const route = useUI((s) => s.route);
  const tree = useWorkspace((s) => s.tree);
  const searchKey = useSettings((s) => s.settings.editor.shortcuts["app.search"] ?? "Mod+P");
  const section: HomeSection | null = route.name === "home" ? route.section : null;
  const go = (s: HomeSection) => useUI.getState().navigate({ name: "home", section: s });
  const projects = [...(tree?.projects ?? [])].sort((a, b) => Number(b.meta.pinned) - Number(a.meta.pinned) || a.meta.name.localeCompare(b.meta.name));
  const favCount = (tree?.state.favorites?.length ?? 0) + (tree?.projects.filter((p) => p.meta.favorite).length ?? 0);

  return (
    <aside aria-label="Workspace" className="island m-2 mr-0 flex w-64 shrink-0 flex-col overflow-hidden">
      <div className="p-2">
        <WorkspaceSwitcher />
        <button
          type="button"
          onClick={() => useUI.getState().setOverlay({ kind: "palette" })}
          className="mt-1 flex h-8 w-full items-center gap-2.5 rounded-md border border-border bg-surface-2 px-2.5 text-sm text-faint hover:border-border-strong hover:text-muted cursor-pointer"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search</span>
          <span className="kbd">{shortcutLabel(searchKey)}</span>
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2" aria-label="Sections">
        <NavItem icon={<Home />} label="Home" tint="var(--facet-coral)" active={section === "home"} onClick={() => go("home")} />
        <NavItem icon={<Clock />} label="Recent" tint="var(--facet-blue)" active={section === "recent"} onClick={() => go("recent")} />
        <NavItem icon={<Star />} label="Favorites" tint="var(--facet-honey)" active={section === "favorites"} count={favCount} onClick={() => go("favorites")} />
        <NavItem icon={<Inbox />} label="Drawings" tint="var(--facet-violet)" active={section === "inbox"} count={tree?.inbox.drawings.length} onClick={() => go("inbox")} drop={tree ? inboxPath(tree) : undefined} />
        <NavItem icon={<LayoutTemplate />} label="Templates" tint="var(--facet-green)" onClick={() => useUI.getState().setOverlay({ kind: "templates" })} />
        <NavItem icon={<Network />} label="Knowledge map" tint="var(--facet-blue)" active={section === "graph"} onClick={() => go("graph")} />

        <div className="mt-4 flex items-center justify-between px-2.5 pb-1">
          <span className="font-display text-xs text-muted">Projects</span>
          <IconButton label="New project" size="sm" onClick={() => void newProject()}>
            <Plus className="size-3.5" />
          </IconButton>
        </div>
        {projects.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-faint">No projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <ProjectItem key={p.path} p={p} active={route.name === "home" && route.projectPath === p.path} currentFolder={route.name === "home" ? route.folderPath : undefined} />
            ))}
          </ul>
        )}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        <NavItem icon={<Plug />} label="Connect tools" tint="var(--facet-green)" onClick={() => useUI.getState().setOverlay({ kind: "guides" })} />
        <NavItem icon={<Archive />} label="Archives" active={section === "archives"} count={tree?.archives.length} onClick={() => go("archives")} />
        <NavItem icon={<Trash2 />} label="Trash" active={section === "trash"} count={tree?.trash.length} onClick={() => go("trash")} />
        <NavItem icon={<Settings />} label="Settings" onClick={() => useUI.getState().navigate({ name: "settings" })} />
      </div>
    </aside>
  );
}
