// The personal component library lives in the workspace (Libraries/components.avenlib) so it
// is shared by every project and travels with the workspace folder.
import { create } from "zustand";
import { exportToBlob } from "@excalidraw/excalidraw";
import { api } from "@/platform/api";
import { parseLibrary, serializeLibrary } from "@/engine/components";
import type { ComponentDef } from "@/engine/types";
import { bytesToDataUrl } from "@/engine/export";
import { join } from "@/lib/path";
import { useWorkspace } from "@/store/workspace";

export const LIBRARY_FILE = "components.avenlib";

interface LibStore {
  root: string | null;
  items: ComponentDef[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (items: ComponentDef[]) => Promise<void>;
}

function file() {
  const root = useWorkspace.getState().active?.path;
  return root ? join(root, "Libraries", LIBRARY_FILE) : null;
}

export const useComponentLibrary = create<LibStore>((set, get) => ({
  root: null,
  items: [],
  loaded: false,
  load: async () => {
    const f = file();
    if (!f) return;
    if (get().loaded && get().root === f) return;
    let items: ComponentDef[] = [];
    if (await api.pathExists(f).catch(() => false)) {
      try {
        items = parseLibrary(await api.fileReadText(f));
      } catch {
        items = [];
      }
    }
    set({ items, loaded: true, root: f });
  },
  save: async (items) => {
    const f = file();
    if (!f) return;
    set({ items });
    await api.fileWriteText(f, serializeLibrary("My components", items));
  },
}));

const previews = new Map<string, string>();

export async function componentPreview(def: ComponentDef): Promise<string | null> {
  const key = `${def.id}@${def.version}`;
  if (previews.has(key)) return previews.get(key)!;
  if (!def.elements.length) return null;
  try {
    const blob = await exportToBlob({
      elements: def.elements,
      appState: { exportBackground: false, viewBackgroundColor: "transparent" },
      files: def.files,
      exportPadding: 6,
      maxWidthOrHeight: 160,
      mimeType: "image/png",
    });
    const url = bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), "image/png");
    previews.set(key, url);
    return url;
  } catch {
    return null;
  }
}
