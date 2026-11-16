// Drag a drawing or folder card onto a folder, project or "Drawings" to move it.
import type { DragEvent } from "react";
import { useWorkspace } from "@/store/workspace";
import { isInside } from "@/lib/path";

export const DND_TYPE = "application/x-aven-path";

export function dropProps(target: string) {
  return {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      (e.currentTarget as HTMLElement).dataset.drop = "true";
    },
    onDragLeave: (e: DragEvent) => {
      delete (e.currentTarget as HTMLElement).dataset.drop;
    },
    onDrop: (e: DragEvent) => {
      delete (e.currentTarget as HTMLElement).dataset.drop;
      const src = e.dataTransfer.getData(DND_TYPE);
      if (!src || isInside(target, src)) return;
      e.preventDefault();
      void useWorkspace.getState().move(src, target);
    },
  };
}
