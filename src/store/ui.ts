import { create } from "zustand";
import type { ReactNode } from "react";

export type HomeSection = "home" | "recent" | "favorites" | "inbox" | "archives" | "trash" | "project" | "graph";

export type Route =
  | { name: "home"; section: HomeSection; projectPath?: string; folderPath?: string }
  | { name: "editor"; path: string; openId: number }
  | { name: "board"; path: string; openId: number }
  | { name: "note"; path: string; openId: number }
  | { name: "settings"; tab?: string };

export interface Toast {
  id: number;
  kind: "info" | "success" | "error" | "warning";
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

export interface PromptRequest {
  kind: "prompt" | "confirm";
  title: string;
  message?: ReactNode;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

export type Overlay =
  | { kind: "palette" }
  | { kind: "shortcuts" }
  | { kind: "templates"; targetDir?: string }
  | { kind: "export"; tab?: "file" | "obsidian" | "notion" | "gdrive"; path?: string }
  | { kind: "about" }
  | { kind: "guides"; tab?: "obsidian" | "notion" | "gdrive" }
  | { kind: "textDiagram" }
  | null;

interface UIStore {
  route: Route;
  history: Route[];
  toasts: Toast[];
  prompt: PromptRequest | null;
  overlay: Overlay;
  navigate: (r: Route) => void;
  back: () => void;
  toast: (t: Omit<Toast, "id">) => number;
  dismissToast: (id: number) => void;
  setOverlay: (o: Overlay) => void;
}

let toastId = 1;

export const useUI = create<UIStore>((set, get) => ({
  route: { name: "home", section: "home" },
  history: [],
  toasts: [],
  prompt: null,
  overlay: null,
  navigate: (route) => set((s) => ({ route, history: [...s.history.slice(-30), s.route] })),
  back: () => {
    const h = get().history;
    if (!h.length) return set({ route: { name: "home", section: "home" } });
    set({ route: h[h.length - 1], history: h.slice(0, -1) });
  },
  toast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    const duration = t.duration ?? (t.kind === "error" ? 9000 : t.action ? 7000 : 3500);
    if (duration > 0) setTimeout(() => get().dismissToast(id), duration);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setOverlay: (overlay) => set({ overlay }),
}));

export const toast = (t: Omit<Toast, "id">) => useUI.getState().toast(t);

let openCounter = 1;
/** Open a drawing in the editor. */
export function openDrawing(path: string) {
  useUI.getState().navigate({ name: "editor", path, openId: openCounter++ });
}

/** Open a Markdown note. */
export function openNote(path: string) {
  useUI.getState().navigate({ name: "note", path, openId: openCounter++ });
}

/** Open any Aven document with the right screen. */
export function openDocument(path: string) {
  const p = path.toLowerCase();
  if (p.endsWith(".avenboard")) openBoard(path);
  else if (p.endsWith(".md")) openNote(path);
  else openDrawing(path);
}

/** Open a Kanban board. */
export function openBoard(path: string) {
  useUI.getState().navigate({ name: "board", path, openId: openCounter++ });
}

export function askText(opts: Omit<PromptRequest, "kind" | "resolve">): Promise<string | null> {
  return new Promise((resolve) =>
    useUI.setState({ prompt: { ...opts, kind: "prompt", resolve: (v) => resolve(typeof v === "string" ? v : null) } }),
  );
}

export function askConfirm(opts: Omit<PromptRequest, "kind" | "resolve" | "initial" | "label" | "placeholder">): Promise<boolean> {
  return new Promise((resolve) => useUI.setState({ prompt: { ...opts, kind: "confirm", resolve: (v) => resolve(v === true) } }));
}
