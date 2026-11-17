// State and saving for the open note, with the same guarantees as drawings and boards:
// debounced autosave, atomic writes, version history and conflict detection.
import { create } from "zustand";
import { api, AppError } from "@/platform/api";
import { useSettings } from "@/store/settings";
import { projectFor, useWorkspace } from "@/store/workspace";
import { toast } from "@/store/ui";
import { basename } from "@/lib/path";
import { debounce, errorMessage } from "@/lib/utils";
import { noteKey, resolveLink, wikilinkTargets } from "./links";

export type NoteSaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

interface NoteStore {
  path: string;
  text: string;
  modified: number;
  saveState: NoteSaveState;
  lastSavedAt: number;
  error: string | null;
  open: (path: string, text: string, modified: number) => void;
  change: (text: string) => void;
  save: (force?: boolean) => Promise<boolean>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

const scheduleSave = debounce(() => void useNote.getState().save(), 600);

export const noteTitle = (path: string) => basename(path).replace(/\.md$/i, "");

export const useNote = create<NoteStore>((set, get) => ({
  path: "",
  text: "",
  modified: 0,
  saveState: "saved",
  lastSavedAt: 0,
  error: null,

  open: (path, text, modified) => set({ path, text, modified, saveState: "saved", lastSavedAt: modified, error: null }),

  change: (text) => {
    if (!get().path || text === get().text) return;
    set({ text, saveState: get().saveState === "conflict" ? "conflict" : "dirty" });
    if (get().saveState !== "conflict") scheduleSave();
  },

  save: async (force = false) => {
    const { text, path, modified, saveState } = get();
    if (!path || (!force && (saveState === "saved" || saveState === "conflict"))) return saveState === "saved";
    set({ saveState: "saving" });
    const s = useSettings.getState().settings.workspace.backups;
    const ws = useWorkspace.getState();
    const key = noteKey(path);
    try {
      const r = await api.drawingWrite({
        wsId: ws.active?.id,
        path,
        content: text,
        drawingId: key,
        policy: { enabled: s.enabled, minIntervalSec: s.minIntervalMin * 60, keep: s.keep },
        expectedModified: force || !modified ? undefined : modified,
      });
      // typing during the save keeps the note dirty
      set({ modified: r.modified, saveState: get().text === text ? "saved" : "dirty", lastSavedAt: Date.now(), error: null });
      if (get().saveState === "dirty") scheduleSave();
      if (ws.active) {
        api.searchIndex({ path, drawingId: key, workspaceId: ws.active.id, kind: "note", title: noteTitle(path), project: projectFor(ws.tree, path)?.meta.name ?? "", body: text }).catch(() => {});
        const links = wikilinkTargets(text)
          .map((t) => resolveLink(ws.tree, t, path))
          .filter((d): d is NonNullable<typeof d> => !!d && d.kind === "drawing")
          .map((d) => ({ id: d.id, label: noteTitle(path) }));
        api.linksSet(key, path, noteTitle(path), links).catch(() => {});
      }
      return true;
    } catch (e) {
      if (e instanceof AppError && e.kind === "conflict") set({ saveState: "conflict", error: e.message });
      else {
        set({ saveState: "error", error: errorMessage(e) });
        toast({ kind: "error", title: "Note not saved", message: errorMessage(e) });
      }
      return false;
    }
  },

  flush: async () => {
    scheduleSave.cancel();
    const st = get().saveState;
    if (st === "dirty" || st === "error") await get().save();
  },

  close: async () => {
    await get().flush();
    set({ path: "", text: "" });
  },
}));
