import { useEffect, useState } from "react";
import { FolderOpen, FolderPlus, HardDrive, ShieldCheck, Sparkles } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import { api, pickFolder } from "@/platform/api";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { join } from "@/lib/path";

/** First run: choose where Aven keeps your work. Nothing is written before the user decides. */
export function Onboarding() {
  const active = useWorkspace((s) => s.active);
  const registry = useWorkspace((s) => s.registry);
  const [name, setName] = useState("My workspace");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.appPaths().then((p) => setParent(p.documentsDir ? join(p.documentsDir, "Aven") : "")).catch(() => {});
  }, []);

  const finish = () => useSettings.getState().update({ onboardingDone: true });

  if (active) {
    // a workspace exists (e.g. opened from another device) but the welcome was never shown
    return (
      <Shell>
        <h1 className="font-display text-[1.75rem] leading-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Aven will use the workspace “{active.name}”.</p>
        <p className="mt-1 break-all text-xs text-faint">{active.path}</p>
        <Button variant="primary" className="mt-6 w-full" size="lg" onClick={finish}>
          Continue
        </Button>
      </Shell>
    );
  }

  const create = async () => {
    if (!parent) return;
    setBusy(true);
    try {
      await api.dirCreate(parent);
      await useWorkspace.getState().createWorkspace(name.trim() || "My workspace", parent);
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="font-display text-[1.75rem] leading-tight">Where should Aven keep your work?</h1>
      <p className="mt-2 text-sm text-muted">A workspace is an ordinary folder on your computer. Projects, drawings, templates and backups live inside it, so you can move it, sync it or back it up like any other folder.</p>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-[550] text-muted">Workspace name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-[550] text-muted">Location</span>
          <div className="flex gap-2">
            <Input className="flex-1" value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Workspace location" />
            <Button
              icon={<FolderOpen className="size-4" />}
              onClick={async () => {
                const p = await pickFolder("Choose where to create the workspace", parent || undefined);
                if (p) setParent(p);
              }}
            >
              Browse
            </Button>
          </div>
          <span className="mt-1.5 block break-all text-xs text-faint">{parent && join(parent, name || "My workspace")}</span>
        </label>
      </div>

      <Button variant="primary" size="lg" className="mt-6 w-full" icon={<FolderPlus className="size-4" />} loading={busy} disabled={!parent} onClick={create}>
        Create workspace
      </Button>
      <Button
        variant="ghost"
        className="mt-2 w-full"
        icon={<HardDrive className="size-4" />}
        onClick={async () => {
          const p = await pickFolder("Choose an existing workspace folder");
          if (!p) return;
          await useWorkspace.getState().openFolder(p);
          finish();
        }}
      >
        Open an existing workspace folder
      </Button>
      {registry.workspaces.some((w) => !w.available) && <p className="mt-3 text-xs text-warning">A previously used workspace could not be found. Reconnect its drive or open its folder.</p>}

      <ul className="mt-8 grid gap-3 border-t border-border pt-6 text-sm text-muted">
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> Works offline. Your files never leave your computer unless you export them.
        </li>
        <li className="flex gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-text" /> Autosave, version history and a trash keep your work safe.
        </li>
      </ul>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dot-grid grid h-full place-items-center overflow-auto p-6">
      <div className="w-full max-w-[480px] anim-pop">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark size={40} />
          <Wordmark className="h-6 w-auto text-text" />
        </div>
        <div className="fold rounded-3xl border border-border bg-surface p-8 shadow-[var(--shadow)]" style={{ ["--fold" as any]: "var(--facet-coral)" }}>{children}</div>
      </div>
    </div>
  );
}
