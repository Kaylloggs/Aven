import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/platform/api";
import type { FileEntry } from "@/platform/types";
import { parseDocument, serializeDocument } from "@/engine/format";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { askConfirm, openDrawing, toast } from "@/store/ui";
import { errorMessage, formatBytes, formatDateTime, timeAgo } from "@/lib/utils";
import { useEditor } from "./session";

/** Automatic backups ("version history") of the open drawing. */
export function BackupsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<FileEntry[] | null>(null);
  const wsId = useWorkspace((s) => s.active?.id);
  const docId = useEditor((s) => s.session?.doc.id);

  useEffect(() => {
    if (!open || !wsId || !docId) return;
    setList(null);
    api.drawingBackups(wsId, docId).then(setList).catch(() => setList([]));
  }, [open, wsId, docId]);

  const restore = async (b: FileEntry) => {
    const s = useEditor.getState().session;
    if (!s || !wsId) return;
    const ok = await askConfirm({
      title: "Restore this version?",
      message: `The drawing will go back to how it was on ${formatDateTime(b.modified)}. The current version is kept as a backup first, so this can be undone.`,
      confirmLabel: "Restore version",
    });
    if (!ok) return;
    try {
      await s.flush();
      const old = parseDocument(await api.fileReadText(b.path));
      const current = s.doc;
      const restored = { ...old, id: current.id, title: current.title, updatedAt: Date.now() };
      await api.drawingWrite({
        wsId,
        path: s.path,
        content: serializeDocument(restored),
        drawingId: current.id,
        policy: { enabled: true, minIntervalSec: 0, keep: useSettings.getState().settings.workspace.backups.keep },
      });
      onClose();
      toast({ kind: "success", title: "Version restored" });
      openDrawing(s.path);
    } catch (e) {
      toast({ kind: "error", title: "Could not restore this version", message: errorMessage(e) });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Version history" description="Aven keeps automatic backups while you work. Restoring never deletes anything." width={520}>
      {!list ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No backups yet" body="A backup is made the next time this drawing is saved after the backup interval set in Settings." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.map((b) => (
            <li key={b.path} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{formatDateTime(b.modified)}</p>
                <p className="text-xs text-faint">
                  {timeAgo(b.modified)} · {formatBytes(b.size)}
                </p>
              </div>
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => restore(b)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
