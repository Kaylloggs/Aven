// Background housekeeping after startup: scheduled workspace snapshots, trash retention and
// crash-recovery notices. Everything here is best effort and never blocks the UI.
import { api } from "@/platform/api";
import { useSettings } from "@/store/settings";
import { useWorkspace } from "@/store/workspace";
import { openDrawing, toast } from "@/store/ui";
import { errorMessage } from "@/lib/utils";

const DAY = 86_400_000;

export async function runSnapshotIfDue(force = false) {
  const { settings, update } = useSettings.getState();
  const ws = useWorkspace.getState().active;
  const snap = settings.workspace.snapshots;
  if (!ws) return null;
  const interval = snap.frequency === "daily" ? DAY : snap.frequency === "weekly" ? 7 * DAY : Infinity;
  if (!force && (snap.frequency === "off" || Date.now() - snap.lastRunAt < interval)) return null;
  try {
    const info = await api.wsSnapshot(ws.id, snap.destination, snap.keep);
    update({ workspace: { snapshots: { lastRunAt: Date.now() } } });
    return info;
  } catch (e) {
    toast({ kind: "error", title: "Workspace backup failed", message: errorMessage(e) });
    return null;
  }
}

export async function runMaintenance() {
  const ws = useWorkspace.getState().active;
  if (!ws) return;
  const days = useSettings.getState().settings.workspace.trashRetentionDays;
  if (days > 0) api.trashPurge(ws.id, undefined, days).catch(() => {});
  setTimeout(() => void runSnapshotIfDue(), 8000);
  const pending = await api.recoveryList().catch(() => []);
  if (pending.length) {
    const first = pending.sort((a, b) => b.savedAt - a.savedAt)[0];
    toast({
      kind: "warning",
      title: pending.length === 1 ? "Unsaved changes were recovered" : `Unsaved changes were recovered for ${pending.length} drawings`,
      message: `Open “${first.title}” to review and restore them.`,
      action: { label: "Open", run: () => openDrawing(first.path) },
      duration: 0,
    });
  }
}
