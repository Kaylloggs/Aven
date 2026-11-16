// State and saving for the open board (one at a time), mirroring the drawing editor's
// guarantees: debounced autosave, atomic writes, version history, conflict detection.
import { create } from "zustand";
import { api, AppError } from "@/platform/api";
import { boardText, serializeBoard, type BoardDoc } from "@/engine/board";
import { useSettings } from "@/store/settings";
import { projectFor, useWorkspace } from "@/store/workspace";
import { toast } from "@/store/ui";
import { debounce, errorMessage } from "@/lib/utils";

export type BoardSaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

interface BoardStore {
  path: string;
  board: BoardDoc | null;
  modified: number;
  saveState: BoardSaveState;
  lastSavedAt: number;
  error: string | null;
  open: (path: string, board: BoardDoc, modified: number) => void;
  change: (fn: (b: BoardDoc) => BoardDoc) => void;
  save: (force?: boolean) => Promise<boolean>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

const scheduleSave = debounce(() => void useBoard.getState().save(), 700);

export const useBoard = create<BoardStore>((set, get) => ({
  path: "",
  board: null,
  modified: 0,
  saveState: "saved",
  lastSavedAt: 0,
  error: null,

  open: (path, board, modified) => set({ path, board, modified, saveState: "saved", lastSavedAt: modified, error: null }),

  change: (fn) => {
    const b = get().board;
    if (!b) return;
    set({ board: fn(b), saveState: get().saveState === "conflict" ? "conflict" : "dirty" });
    if (get().saveState !== "conflict") scheduleSave();
  },

  save: async (force = false) => {
    const { board, path, modified, saveState } = get();
    if (!board || (!force && (saveState === "saved" || saveState === "conflict"))) return saveState === "saved";
    set({ saveState: "saving" });
    const s = useSettings.getState().settings.workspace.backups;
    const ws = useWorkspace.getState();
    try {
      const r = await api.drawingWrite({
        wsId: ws.active?.id,
        path,
        content: serializeBoard(board),
        drawingId: board.id,
        policy: { enabled: s.enabled, minIntervalSec: s.minIntervalMin * 60, keep: s.keep },
        expectedModified: force || !modified ? undefined : modified,
      });
      // edits made while saving keep the board dirty
      set({ modified: r.modified, saveState: get().board === board ? "saved" : "dirty", lastSavedAt: Date.now(), error: null });
      if (get().saveState === "dirty") scheduleSave();
      if (ws.active) {
        api
          .searchIndex({ path, drawingId: board.id, workspaceId: ws.active.id, kind: "board", title: board.title, project: projectFor(ws.tree, path)?.meta.name ?? "", body: boardText(board) })
          .catch(() => {});
        api.linksSet(board.id, path, board.title, Object.values(board.cards).flatMap((c) => c.links.map((l) => ({ id: l.id, label: c.title })))).catch(() => {});
      }
      return true;
    } catch (e) {
      if (e instanceof AppError && e.kind === "conflict") set({ saveState: "conflict", error: e.message });
      else {
        set({ saveState: "error", error: errorMessage(e) });
        toast({ kind: "error", title: "Board not saved", message: errorMessage(e) });
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
    set({ board: null, path: "" });
  },
}));
