// Central command runner shared by shortcuts, menus and the command palette.
import { askText, openBoard, openDrawing, toast, useUI } from "@/store/ui";
import { openMenuAt } from "@/components/Menu";
import type { BoardPreset } from "@/engine/board";
import { inboxPath, useWorkspace } from "@/store/workspace";
import { useEditor } from "@/features/editor/session";
import { setTool } from "@/features/editor/tools";
import { insertGauge } from "@/features/editor/GaugePanel";
import { applyTextStyle } from "@/features/editor/TextStylePanel";
import { SHORTCUTS } from "@/features/shortcuts/registry";

/** The folder new drawings go to, based on what the user is looking at. */
export function currentTargetDir(): string | null {
  const route = useUI.getState().route;
  const tree = useWorkspace.getState().tree;
  if (!tree) return null;
  if (route.name === "home" && route.section === "project") return route.folderPath ?? route.projectPath ?? inboxPath(tree);
  if (route.name === "editor") return route.path.slice(0, route.path.lastIndexOf("\\"));
  return inboxPath(tree);
}

export async function newDrawing(dir?: string | null, title?: string) {
  const target = dir ?? currentTargetDir();
  if (!target) return;
  const name = title ?? (await askText({ title: "New drawing", label: "Name", initial: "Untitled drawing", confirmLabel: "Create drawing" }));
  if (!name) return;
  await closeEditorIfOpen();
  const path = await useWorkspace.getState().createDrawing(target, name);
  openDrawing(path);
}

const BOARD_PRESETS: { id: BoardPreset; label: string; hint: string }[] = [
  { id: "kanban", label: "Kanban", hint: "To do, In progress, Done" },
  { id: "sprint", label: "Sprint", hint: "Backlog to Done, 5 columns" },
  { id: "content", label: "Content pipeline", hint: "Ideas to Published" },
  { id: "week", label: "Week planner", hint: "Monday to Weekend" },
  { id: "blank", label: "Blank board", hint: "One empty column" },
];

/** Create a Kanban board (asks for the layout when an anchor element is given). */
export async function newBoard(dir?: string | null, anchor?: HTMLElement | null) {
  const target = dir ?? currentTargetDir();
  if (!target) return;
  const create = async (preset: BoardPreset) => {
    const name = await askText({ title: "New board", label: "Name", initial: preset === "week" ? "This week" : "New board", confirmLabel: "Create board" });
    if (!name) return;
    await closeEditorIfOpen();
    const path = await useWorkspace.getState().createBoard(target, name, preset);
    openBoard(path);
  };
  if (!anchor) return create("kanban");
  openMenuAt(anchor, [{ heading: "Start from" }, ...BOARD_PRESETS.map((p) => ({ label: p.label, hint: p.hint, onSelect: () => void create(p.id) }))]);
}

export async function newProject() {
  const name = await askText({ title: "New project", label: "Project name", placeholder: "e.g. Website redesign", confirmLabel: "Create project" });
  if (!name) return;
  await closeEditorIfOpen();
  const path = await useWorkspace.getState().createProject(name);
  useUI.getState().navigate({ name: "home", section: "project", projectPath: path, folderPath: path });
}

export async function closeEditorIfOpen() {
  const s = useEditor.getState().session;
  if (s) await s.flush();
}

export async function closeEditor() {
  await closeEditorIfOpen();
  await useWorkspace.getState().refresh();
  const route = useUI.getState().route;
  const tree = useWorkspace.getState().tree;
  if (route.name === "editor" && tree) {
    const p = [...tree.projects].find((x) => route.path.toLowerCase().startsWith(x.path.toLowerCase() + "\\"));
    if (p) {
      useUI.getState().navigate({ name: "home", section: "project", projectPath: p.path, folderPath: route.path.slice(0, route.path.lastIndexOf("\\")) });
      return;
    }
  }
  useUI.getState().navigate({ name: "home", section: "home" });
}

function togglePanel(panel: "layers" | "components" | "info") {
  if (panel === "layers") return useEditor.setState({ layersOpen: !useEditor.getState().layersOpen });
  const cur = useEditor.getState().panel;
  useEditor.setState({ panel: cur === panel ? null : panel });
}

const handlers: Record<string, () => void | boolean | Promise<void>> = {
  "app.search": () => useUI.getState().setOverlay({ kind: "palette" }),
  "app.shortcuts": () => useUI.getState().setOverlay({ kind: "shortcuts" }),
  "app.guides": () => useUI.getState().setOverlay({ kind: "guides" }),
  "app.settings": async () => {
    await closeEditorIfOpen();
    useUI.getState().navigate({ name: "settings" });
  },
  "app.newDrawing": () => newDrawing(),
  "app.newProject": () => newProject(),
  "app.newBoard": () => newBoard(),
  "app.templates": () => useUI.getState().setOverlay({ kind: "templates", targetDir: currentTargetDir() ?? undefined }),
  "editor.save": async () => {
    const ok = await useEditor.getState().session?.save("manual");
    if (ok) toast({ kind: "success", title: "Saved", duration: 1500 });
  },
  "editor.export": () => useUI.getState().setOverlay({ kind: "export" }),
  "editor.close": () => closeEditor(),
  "editor.panel.layers": () => togglePanel("layers"),
  "editor.panel.components": () => togglePanel("components"),
  "editor.panel.info": () => togglePanel("info"),
  "text.bold": () => applyTextStyle("bold"),
  "text.italic": () => applyTextStyle("italic"),
  "text.underline": () => applyTextStyle("underline"),
  "text.strike": () => applyTextStyle("strike"),
  "editor.textDiagram": () => useUI.getState().setOverlay({ kind: "textDiagram" }),
  "editor.insertGauge": () => insertGauge(useEditor.getState().session?.api ?? null),
  "editor.library": () => {
    const api = useEditor.getState().session?.api;
    api?.toggleSidebar({ name: "default", tab: "library" });
  },
};

export const commands = {
  run(id: string) {
    const tool = SHORTCUTS.find((s) => s.id === id)?.tool;
    if (tool) return setTool(useEditor.getState().session?.api ?? null, tool);
    const h = handlers[id];
    if (h) return h();
  },
  has: (id: string) => id in handlers || !!SHORTCUTS.find((s) => s.id === id)?.tool,
};
