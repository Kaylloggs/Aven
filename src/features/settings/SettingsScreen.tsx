import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Brush,
  Cloud,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Keyboard,
  Layers,
  LifeBuoy,
  Moon,
  Monitor,
  RotateCcw,
  Sun,
  Trash2,
  Check,
  Copy,
  Plug,
} from "lucide-react";
import { Button, Field, Input, Segmented, Select, Switch } from "@/components/ui";
import { LogoMark, Wordmark } from "@/components/Logo";
import { CanvasStylePicker } from "@/components/CanvasStylePicker";
import { api, isDesktop, openExternal, openPath, pickFile, pickFolder, revealInExplorer } from "@/platform/api";
import type { AppPaths, SnapshotInfo, StorageUsage } from "@/platform/types";
import { resolvedTheme, useSettings, type Accent } from "@/store/settings";
import { useWorkspace } from "@/store/workspace";
import { askConfirm, askText, toast, useUI } from "@/store/ui";
import { runSnapshotIfDue } from "@/features/maintenance";
import { SHORTCUTS, bindingFor } from "@/features/shortcuts/registry";
import { cx, errorMessage, eventToShortcut, formatBytes, formatDateTime, shortcutLabel, timeAgo } from "@/lib/utils";

const TABS = [
  { id: "appearance", label: "Appearance", icon: <Brush className="size-4" /> },
  { id: "workspace", label: "Workspace and storage", icon: <HardDrive className="size-4" /> },
  { id: "backups", label: "Backups and recovery", icon: <LifeBuoy className="size-4" /> },
  { id: "editor", label: "Editor", icon: <Brush className="size-4" /> },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard className="size-4" /> },
  { id: "advanced", label: "Editing mode", icon: <Layers className="size-4" /> },
  { id: "export", label: "Export", icon: <Download className="size-4" /> },
  { id: "integrations", label: "Integrations", icon: <Plug className="size-4" /> },
  { id: "about", label: "About", icon: <Info className="size-4" /> },
] as const;

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-lg">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted max-w-[70ch]">{description}</p>}
      <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface px-4 shadow-[var(--shadow-sm)]">{children}</div>
    </section>
  );
}

const ACCENTS: { id: Accent; color: string }[] = [
  { id: "coral", color: "#F76046" },
  { id: "honey", color: "#F5AE39" },
  { id: "violet", color: "#8E5BE8" },
  { id: "blue", color: "#567BF7" },
  { id: "green", color: "#2FB27E" },
];

function Appearance() {
  const { settings, update } = useSettings();
  const a = settings.appearance;
  return (
    <>
      <Section title="Theme">
        <Field label="Interface theme" inline hint="Dark is designed as the main theme.">
          <Segmented
            label="Theme"
            value={a.theme}
            onChange={(v) => update({ appearance: { theme: v } })}
            options={[
              { value: "dark", label: <><Moon className="size-3.5" /> Dark</> },
              { value: "light", label: <><Sun className="size-3.5" /> Light</> },
              { value: "system", label: <><Monitor className="size-3.5" /> System</> },
            ]}
          />
        </Field>
        <Field label="Accent color" inline>
          <div className="flex gap-2" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={a.accent === x.id}
                aria-label={x.id}
                onClick={() => update({ appearance: { accent: x.id } })}
                className={cx("grid size-7 place-items-center rounded-full cursor-pointer ring-offset-2 ring-offset-[var(--surface)]", a.accent === x.id && "ring-2 ring-[var(--text)]")}
                style={{ background: x.color }}
              >
                {a.accent === x.id && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Density" inline hint="Compact fits more on screen.">
          <Segmented label="Density" value={a.density} onChange={(v) => update({ appearance: { density: v } })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
        </Field>
      </Section>
      <Section title="Canvas" description="Each drawing keeps its own background; this is the one new drawings start with.">
        <Field label="Default canvas for new drawings" inline hint="Light or dark, with or without dots. Exports always use a clean background.">
          <CanvasStylePicker value={a.canvasStyle} appTheme={resolvedTheme(a.theme)} onChange={(v) => update({ appearance: { canvasStyle: v } })} />
        </Field>
        <Field label="Show grid in new drawings" inline>
          <Switch label="Show grid" checked={a.showGrid} onChange={(v) => update({ appearance: { showGrid: v } })} />
        </Field>
        <Field label="Grid size" inline>
          <Select value={a.gridSize} onChange={(e) => update({ appearance: { gridSize: Number(e.target.value) } })} aria-label="Grid size">
            {[10, 16, 20, 24, 32, 40].map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Major grid line every" inline>
          <Select value={a.gridStep} onChange={(e) => update({ appearance: { gridStep: Number(e.target.value) } })} aria-label="Grid step">
            {[1, 2, 4, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} cells
              </option>
            ))}
          </Select>
        </Field>
      </Section>
    </>
  );
}

function WorkspaceTab() {
  const { settings, update } = useSettings();
  const registry = useWorkspace((s) => s.registry);
  const active = useWorkspace((s) => s.active);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => {
    if (active) api.wsStorage(active.id).then(setUsage).catch(() => setUsage(null));
  }, [active]);
  return (
    <>
      <Section title="Active workspace" description="All projects and drawings of this workspace live in this folder. Moving the folder with Aven keeps everything intact.">
        {active && (
          <div className="py-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 break-all font-mono text-xs text-text">{active.path}</p>
              <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => void openPath(active.path)}>
                Open
              </Button>
              <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(active.path)}>
                Copy
              </Button>
            </div>
            {usage && (
              <div className="mt-4">
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  {[
                    [usage.content, "var(--accent)"],
                    [usage.backups, "#8E5BE8"],
                    [usage.thumbnails, "#567BF7"],
                    [usage.trash, "#868e96"],
                  ].map(([v, c], i) => (
                    <div key={i} style={{ width: `${((v as number) / Math.max(1, usage.total)) * 100}%`, background: c as string }} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <span>Total {formatBytes(usage.total)}</span>
                  <span>Drawings and assets {formatBytes(usage.content)}</span>
                  <span>Backups {formatBytes(usage.backups)}</span>
                  <span>Thumbnails {formatBytes(usage.thumbnails)}</span>
                  <span>Trash {formatBytes(usage.trash)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <Field label="Rename workspace" inline>
          <Button
            size="sm"
            onClick={async () => {
              if (!active) return;
              const n = await askText({ title: "Rename workspace", initial: active.name, confirmLabel: "Rename" });
              if (n) {
                await api.wsRename(active.id, n);
                await useWorkspace.getState().refresh();
              }
            }}
          >
            Rename…
          </Button>
        </Field>
        <Field label="Move workspace to another folder" inline hint="Copies everything, verifies the copy, then removes the old folder.">
          <Button
            size="sm"
            onClick={async () => {
              if (!active) return;
              const p = await pickFolder("Move the workspace into…");
              if (!p) return;
              if (!(await askConfirm({ title: "Move workspace?", message: `“${active.name}” will be moved into ${p}. Close other apps that use its files first.`, confirmLabel: "Move workspace" }))) return;
              try {
                await api.wsRelocate(active.id, p);
                await useWorkspace.getState().init();
                toast({ kind: "success", title: "Workspace moved" });
              } catch (e) {
                toast({ kind: "error", title: "The workspace was not moved", message: errorMessage(e) });
              }
            }}
          >
            Move…
          </Button>
        </Field>
      </Section>

      <Section title="All workspaces" description="Keep separate workspaces for clients, personal work or archives, each in its own folder.">
        {registry.workspaces.map((w) => (
          <div key={w.id} className="flex items-center gap-3 py-3">
            <HardDrive className={cx("size-4", w.available ? "text-muted" : "text-danger")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {w.name} {w.id === active?.id && <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-text">active</span>}
                {!w.available && <span className="ml-1 text-2xs text-danger">folder missing</span>}
              </p>
              <p className="truncate text-xs text-faint">{w.path}</p>
            </div>
            {w.id !== active?.id && w.available && (
              <Button size="sm" onClick={() => void useWorkspace.getState().switchTo(w.id)}>
                Switch
              </Button>
            )}
            {w.id !== active?.id && (
              <Button size="sm" variant="ghost" onClick={() => void useWorkspace.getState().forget(w.id)} data-tip="Removes it from this list. Files are not deleted.">
                Remove from list
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-2 py-3">
          <Button
            size="sm"
            icon={<FolderOpen className="size-3.5" />}
            onClick={async () => {
              const name = await askText({ title: "New workspace", label: "Name", initial: "New workspace", confirmLabel: "Choose location" });
              if (!name) return;
              const p = await pickFolder("Where should the workspace folder be created?");
              if (p) await useWorkspace.getState().createWorkspace(name, p);
            }}
          >
            New workspace…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const p = await pickFolder("Choose a folder to use as a workspace");
              if (p) await useWorkspace.getState().openFolder(p);
            }}
          >
            Open existing folder…
          </Button>
        </div>
      </Section>

      <Section title="Saving">
        <Field label="Autosave" inline hint="Saves shortly after every change. When off, use Ctrl+S; unsaved work is still kept for recovery.">
          <Switch label="Autosave" checked={settings.workspace.autosave} onChange={(v) => update({ workspace: { autosave: v } })} />
        </Field>
        <Field label="Autosave delay" inline>
          <Select value={settings.workspace.autosaveDelaySec} onChange={(e) => update({ workspace: { autosaveDelaySec: Number(e.target.value) } })} aria-label="Autosave delay">
            {[0.5, 1.5, 3, 5, 10, 30].map((n) => (
              <option key={n} value={n}>
                {n < 1 ? "Immediately" : `${n} seconds`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Keep deleted items in the trash for" inline>
          <Select value={settings.workspace.trashRetentionDays} onChange={(e) => update({ workspace: { trashRetentionDays: Number(e.target.value) } })} aria-label="Trash retention">
            {[7, 14, 30, 90, 0].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} days` : "Forever"}
              </option>
            ))}
          </Select>
        </Field>
      </Section>
    </>
  );
}

function Backups() {
  const { settings, update } = useSettings();
  const active = useWorkspace((s) => s.active);
  const [snaps, setSnaps] = useState<SnapshotInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const b = settings.workspace.backups;
  const s = settings.workspace.snapshots;
  const load = () => active && api.wsSnapshots(active.id, s.destination).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, s.destination]);
  return (
    <>
      <Section title="Version history" description="Before a drawing is overwritten, Aven copies the previous version into the workspace's .aven/backups folder.">
        <Field label="Keep automatic versions" inline>
          <Switch label="Version history" checked={b.enabled} onChange={(v) => update({ workspace: { backups: { enabled: v } } })} />
        </Field>
        <Field label="At most one version every" inline>
          <Select value={b.minIntervalMin} onChange={(e) => update({ workspace: { backups: { minIntervalMin: Number(e.target.value) } } })} aria-label="Backup interval">
            {[1, 5, 10, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minute{n > 1 ? "s" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Versions kept per drawing" inline>
          <Select value={b.keep} onChange={(e) => update({ workspace: { backups: { keep: Number(e.target.value) } } })} aria-label="Versions kept">
            {[5, 10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Workspace backups" description="A complete, compressed copy of the workspace. Store it on another drive or a synced folder to protect against disk failure.">
        <Field label="Automatic backup" inline>
          <Segmented label="Backup frequency" value={s.frequency} onChange={(v) => update({ workspace: { snapshots: { frequency: v } } })} options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
        </Field>
        <Field label="Backup folder" inline hint={s.destination ?? "Inside the workspace (.aven/snapshots). Choose another drive for real protection."}>
          <div className="flex gap-2">
            <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={async () => { const p = await pickFolder("Choose a backup folder"); if (p) update({ workspace: { snapshots: { destination: p } } }); }}>
              Choose…
            </Button>
            {s.destination && (
              <Button size="sm" variant="ghost" onClick={() => update({ workspace: { snapshots: { destination: null } } })}>
                Reset
              </Button>
            )}
          </div>
        </Field>
        <Field label="Backups kept" inline>
          <Select value={s.keep} onChange={(e) => update({ workspace: { snapshots: { keep: Number(e.target.value) } } })} aria-label="Backups kept">
            {[2, 3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-3 py-3">
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await runSnapshotIfDue(true);
              setBusy(false);
              if (r) toast({ kind: "success", title: "Backup created", message: `${r.name} · ${formatBytes(r.size)}` });
              void load();
            }}
          >
            Back up now
          </Button>
          <span className="text-xs text-faint">{s.lastRunAt ? `Last backup ${timeAgo(s.lastRunAt)}` : "No backup yet"}</span>
        </div>
        {snaps.map((x) => (
          <div key={x.path} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{formatDateTime(x.created)}</p>
              <p className="truncate text-xs text-faint">
                {x.name} · {formatBytes(x.size)}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void revealInExplorer(x.path)}>
              Show
            </Button>
            <Button
              size="sm"
              icon={<RotateCcw className="size-3.5" />}
              onClick={async () => {
                const parent = await pickFolder("Restore the backup into which folder? (a new workspace folder is created there)");
                if (!parent) return;
                try {
                  const w = await api.wsRestoreSnapshot(x.path, parent, `${active?.name ?? "Workspace"} (restored)`);
                  await useWorkspace.getState().switchTo(w.id);
                  toast({ kind: "success", title: "Backup restored as a new workspace", message: w.path });
                } catch (e) {
                  toast({ kind: "error", title: "Restore failed", message: errorMessage(e) });
                }
              }}
            >
              Restore…
            </Button>
          </div>
        ))}
        <div className="py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const [f] = await pickFile("Choose a workspace backup", [{ name: "Aven backup", extensions: ["avenbackup", "zip"] }]);
              if (!f) return;
              const parent = await pickFolder("Restore into which folder?");
              if (!parent) return;
              try {
                const w = await api.wsRestoreSnapshot(f, parent, "Restored workspace");
                await useWorkspace.getState().switchTo(w.id);
                toast({ kind: "success", title: "Backup restored as a new workspace" });
              } catch (e) {
                toast({ kind: "error", title: "Restore failed", message: errorMessage(e) });
              }
            }}
          >
            Restore from a backup file…
          </Button>
        </div>
      </Section>
      <Section title="Crash recovery" description="While you draw, unsaved changes are mirrored to a recovery file. After an unexpected shutdown, Aven offers to restore them when you reopen the drawing.">
        <p className="py-3 text-sm text-muted">Always on. Recovery files are deleted once the drawing is saved.</p>
      </Section>
    </>
  );
}

function EditorTab() {
  const { settings, update } = useSettings();
  const e = settings.editor;
  return (
    <Section title="Defaults for new shapes" description="Applied to new drawings; each drawing remembers its own last-used styles.">
      <Field label="Stroke color" inline>
        <input type="color" aria-label="Stroke color" value={e.defaultStrokeColor} onChange={(ev) => update({ editor: { defaultStrokeColor: ev.target.value } })} className="size-8 cursor-pointer rounded-md border border-border bg-transparent" />
      </Field>
      <Field label="Fill" inline>
        <Select value={e.defaultBackgroundColor} onChange={(ev) => update({ editor: { defaultBackgroundColor: ev.target.value } })} aria-label="Fill">
          <option value="transparent">None</option>
          <option value="#ffec99">Yellow</option>
          <option value="#a5d8ff">Blue</option>
          <option value="#b2f2bb">Green</option>
          <option value="#ffc9c9">Red</option>
          <option value="#d0bfff">Violet</option>
        </Select>
      </Field>
      <Field label="Stroke width" inline>
        <Segmented label="Stroke width" value={String(e.defaultStrokeWidth)} onChange={(v) => update({ editor: { defaultStrokeWidth: Number(v) } })} options={[{ value: "1", label: "Thin" }, { value: "2", label: "Bold" }, { value: "4", label: "Extra bold" }]} />
      </Field>
      <Field label="Line style" inline hint="Architect is clean and straight; artist and cartoonist look hand-drawn.">
        <Segmented label="Sloppiness" value={String(e.defaultRoughness)} onChange={(v) => update({ editor: { defaultRoughness: Number(v) } })} options={[{ value: "0", label: "Architect" }, { value: "1", label: "Artist" }, { value: "2", label: "Cartoonist" }]} />
      </Field>
      <Field label="Font" inline>
        <Select value={e.defaultFontFamily} onChange={(ev) => update({ editor: { defaultFontFamily: Number(ev.target.value) } })} aria-label="Font">
          <option value={5}>Hand-drawn (Excalifont)</option>
          <option value={6}>Normal (Nunito)</option>
          <option value={8}>Code (Comic Shanns)</option>
          <option value={9}>Liberation Sans</option>
          <option value={7}>Lilita One (display)</option>
        </Select>
      </Field>
      <Field label="Tool when a drawing opens" inline>
        <Select value={e.defaultTool} onChange={(ev) => update({ editor: { defaultTool: ev.target.value as any } })} aria-label="Default tool">
          <option value="selection">Select</option>
          <option value="hand">Hand</option>
          <option value="freedraw">Draw</option>
          <option value="rectangle">Rectangle</option>
          <option value="text">Text</option>
        </Select>
      </Field>
      <Field label="Snap to objects in new drawings" inline hint="Smart alignment guides while moving shapes.">
        <Switch label="Snap to objects" checked={e.objectSnapping} onChange={(v) => update({ editor: { objectSnapping: v } })} />
      </Field>
    </Section>
  );
}

function ShortcutsTab() {
  const { settings, update } = useSettings();
  const custom = settings.editor.shortcuts;
  const [recording, setRecording] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const combo = e.key === "Backspace" || e.key === "Delete" ? "" : eventToShortcut(e);
      const clash = SHORTCUTS.find((s) => s.id !== recording && combo && bindingFor(s.id, custom) === combo);
      if (clash) toast({ kind: "warning", title: `${shortcutLabel(combo)} is already used`, message: `It is assigned to “${clash.label}”.` });
      else update({ editor: { shortcuts: { ...custom, [recording]: combo } } });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, custom, update]);
  const list = SHORTCUTS.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Input className="w-72" placeholder="Search shortcuts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shortcuts" />
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => update({ editor: { shortcuts: {} } })} disabled={!Object.keys(custom).length}>
          Reset all to defaults
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted max-w-[70ch]">Aven commands and tools can be rebound. Canvas editing shortcuts (undo, copy, arrange, zoom) are built into the drawing engine and listed for reference. Press Backspace while recording to remove a binding.</p>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {list.map((s) => {
          const keys = bindingFor(s.id, custom);
          const changed = s.id in custom;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2">
              <span className="flex-1 text-sm">{s.label}</span>
              <span className="w-20 text-2xs text-faint">{s.group}</span>
              {s.kind === "aven" ? (
                <>
                  <button onClick={() => setRecording(s.id)} className={cx("min-w-28 rounded-md border px-2 py-1 text-xs cursor-pointer", recording === s.id ? "border-accent bg-accent-soft text-text" : "border-border hover:border-border-strong")}>
                    {recording === s.id ? "Press keys…" : keys ? shortcutLabel(keys) : "Not set"}
                  </button>
                  <button aria-label="Reset" disabled={!changed} onClick={() => { const { [s.id]: _, ...rest } = custom; update({ editor: { shortcuts: rest } }); }} className="text-faint hover:text-text disabled:invisible cursor-pointer">
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-28 text-center text-xs text-faint">{shortcutLabel(keys)}</span>
                  <span className="w-3.5" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdvancedTab() {
  const { settings, update } = useSettings();
  const a = settings.advanced;
  return (
    <Section title="Editing mode" description="Normal gives you layers and reusable components. Simple keeps the whiteboard as plain as possible. Drawings keep their layers and components either way.">
      <div className="mb-2 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Editing mode">
        {[
          { on: false, title: "Simple", body: "Just the canvas and its tools. Best for quick sketches." },
          { on: true, title: "Normal", body: "Adds layers and components for bigger, organised work." },
        ].map((m) => (
          <button
            key={m.title}
            type="button"
            role="radio"
            aria-checked={a.enabled === m.on}
            onClick={() => update({ advanced: { enabled: m.on } })}
            className={cx(
              "rounded-xl border p-4 text-left cursor-pointer transition-colors duration-150",
              a.enabled === m.on ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:border-border-strong",
            )}
          >
            <span className="block font-[650] text-text">{m.title}</span>
            <span className="mt-1 block text-xs text-muted">{m.body}</span>
          </button>
        ))}
      </div>
      <Field label="Layers" inline hint="Hide, lock, fade, reorder and group sets of shapes.">
        <Switch label="Layers" disabled={!a.enabled} checked={a.layers} onChange={(v) => update({ advanced: { layers: v } })} />
      </Field>
      <Field label="Components" inline hint="Save shapes as reusable components with linked instances.">
        <Switch label="Components" disabled={!a.enabled} checked={a.components} onChange={(v) => update({ advanced: { components: v } })} />
      </Field>
      <Field label="When a component changes" inline hint="What to do with the other instances in the drawing.">
        <Select disabled={!a.enabled} value={a.instanceUpdates} onChange={(e) => update({ advanced: { instanceUpdates: e.target.value as any } })} aria-label="Instance updates">
          <option value="ask">Ask me</option>
          <option value="always">Update them</option>
          <option value="never">Leave them</option>
        </Select>
      </Field>
    </Section>
  );
}

function ExportTab() {
  const { settings, update } = useSettings();
  const x = settings.export;
  return (
    <Section title="Export defaults">
      <Field label="Default format" inline>
        <Select value={x.defaultFormat} onChange={(e) => update({ export: { defaultFormat: e.target.value as any } })} aria-label="Default format">
          {["png", "svg", "pdf", "jpeg", "webp"].map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Default resolution" inline>
        <Segmented label="Default scale" value={String(x.defaultScale)} onChange={(v) => update({ export: { defaultScale: Number(v) } })} options={["1", "2", "3", "4"].map((s) => ({ value: s, label: `${s}x` }))} />
      </Field>
      <Field label="Include background" inline>
        <Switch label="Include background" checked={x.background} onChange={(v) => update({ export: { background: v } })} />
      </Field>
      <Field label="Padding" inline>
        <Select value={x.padding} onChange={(e) => update({ export: { padding: Number(e.target.value) } })} aria-label="Padding">
          {[0, 8, 16, 24, 48, 96].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </Select>
      </Field>
      <Field label="File names" inline hint="Used for exports, Obsidian notes and Google Drive files.">
        <Select value={x.filenamePattern} onChange={(e) => update({ export: { filenamePattern: e.target.value as any } })} aria-label="File name pattern">
          <option value="{title}">Drawing title</option>
          <option value="{project} - {title}">Project - Drawing title</option>
          <option value="{title} {date}">Drawing title and date</option>
        </Select>
      </Field>
    </Section>
  );
}

function IntegrationsTab() {
  const { settings, update } = useSettings();
  const ob = settings.export.obsidian;
  const gd = settings.export.gdrive;
  const [status, setStatus] = useState({ gdriveConnected: false, notionConnected: false });
  const [token, setToken] = useState("");
  const [driveFolders, setDriveFolders] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => api.integrationsStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    void refresh();
    api.gdriveFolders().then(setDriveFolders).catch(() => {});
  }, []);
  const guide = (tab: "obsidian" | "notion" | "gdrive") => (
    <button className="ml-1 text-accent-text hover:underline cursor-pointer" onClick={() => useUI.getState().setOverlay({ kind: "guides", tab })}>
      Step-by-step guide
    </button>
  );
  return (
    <>
      <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg">New to integrations?</p>
          <p className="text-sm text-muted">Follow the guided setup for Obsidian, Notion and Google Drive.</p>
        </div>
        <Button variant="primary" onClick={() => useUI.getState().setOverlay({ kind: "guides" })}>
          Open setup guides
        </Button>
      </div>
      <Section title="Obsidian" description={<>Export drawings straight into a vault as an image plus a Markdown note. Works offline.{guide("obsidian")}</>}>
        <Field label="Default vault" inline hint={ob.vaultPath ?? "Not set. Aven also detects the vaults Obsidian knows about."}>
          <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={async () => { const p = await pickFolder("Choose your Obsidian vault"); if (p) update({ export: { obsidian: { vaultPath: p } } }); }}>
            Choose vault…
          </Button>
        </Field>
        <Field label="Notes folder" inline>
          <Input className="w-56" value={ob.folder} onChange={(e) => update({ export: { obsidian: { folder: e.target.value } } })} />
        </Field>
        <Field label="Attachments folder" inline>
          <Input className="w-56" value={ob.attachmentsFolder} onChange={(e) => update({ export: { obsidian: { attachmentsFolder: e.target.value } } })} />
        </Field>
      </Section>

      <Section
        title="Notion"
        description={
          <>
            Notion-ready folders and copy-to-clipboard need no account. To publish pages directly, create an internal integration in Notion, give it access to a page and paste its secret here. The secret is stored in Windows Credential Manager, never in Aven's files.{guide("notion")}
          </>
        }
      >
        <Field label="Integration secret" inline hint={status.notionConnected ? "Connected." : "Not connected."}>
          <div className="flex gap-2">
            <Input className="w-56" type="password" placeholder={status.notionConnected ? "••••••••" : "secret_… or ntn_…"} value={token} onChange={(e) => setToken(e.target.value)} aria-label="Notion secret" />
            <Button
              size="sm"
              loading={busy === "notion"}
              disabled={!token.trim()}
              onClick={async () => {
                setBusy("notion");
                try {
                  await api.notionSetToken(token);
                  const who = await api.notionCheck();
                  toast({ kind: "success", title: "Notion connected", message: who });
                  setToken("");
                } catch (e) {
                  toast({ kind: "error", title: "Notion rejected the secret", message: errorMessage(e) });
                  await api.notionSetToken("");
                } finally {
                  setBusy(null);
                  void refresh();
                }
              }}
            >
              Connect
            </Button>
            {status.notionConnected && (
              <Button size="sm" variant="ghost" onClick={async () => { await api.notionSetToken(""); void refresh(); }}>
                Disconnect
              </Button>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Google Drive" description={<>Two ways to send drawings to Google Drive: write into the folder synced by Google Drive for desktop (no sign-in, works offline), or upload directly with your Google account.{guide("gdrive")}</>}>
        <Field label="Google Drive for desktop folder" inline hint={gd.folder ?? (driveFolders[0] ? `Detected: ${driveFolders[0]}` : "Not detected. Choose it manually, for example G:\\My Drive.")}>
          <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={async () => { const p = await pickFolder("Choose your Google Drive folder"); if (p) update({ export: { gdrive: { folder: p } } }); }}>
            Choose…
          </Button>
        </Field>
        <div className="py-3">
          <p className="text-sm font-[550]">Direct upload (optional)</p>
          <p className="mt-1 text-xs text-muted max-w-[70ch]">Google requires every app that signs in to have its own OAuth client. Create a Desktop app client in Google Cloud Console (APIs and Services › Credentials), enable the Google Drive API, then paste its id and secret. Aven only asks for access to files it creates.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Input placeholder="Client id" value={gd.clientId} onChange={(e) => update({ export: { gdrive: { clientId: e.target.value } } })} aria-label="Google client id" />
            <Input placeholder="Client secret" type="password" value={gd.clientSecret} onChange={(e) => update({ export: { gdrive: { clientSecret: e.target.value } } })} aria-label="Google client secret" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            {status.gdriveConnected ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm text-success">
                  <Check className="size-4" /> Connected
                </span>
                <Button size="sm" variant="ghost" onClick={async () => { await api.gdriveDisconnect(); void refresh(); }}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                icon={<Cloud className="size-3.5" />}
                loading={busy === "gdrive"}
                disabled={!gd.clientId.trim() || !gd.clientSecret.trim() || !isDesktop}
                onClick={async () => {
                  setBusy("gdrive");
                  try {
                    await api.gdriveConnect(gd.clientId.trim(), gd.clientSecret.trim());
                    toast({ kind: "success", title: "Google Drive connected" });
                    update({ export: { gdrive: { clientSecret: "" } } });
                  } catch (e) {
                    toast({ kind: "error", title: "Google sign-in failed", message: errorMessage(e) });
                  } finally {
                    setBusy(null);
                    void refresh();
                  }
                }}
              >
                Sign in with Google
              </Button>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

function AboutTab() {
  const [paths, setPaths] = useState<AppPaths | null>(null);
  useEffect(() => {
    api.appPaths().then(setPaths).catch(() => {});
  }, []);
  const diagnostics = paths ? `Aven ${paths.version}\nConfig: ${paths.configDir}\nData: ${paths.dataDir}\nUser agent: ${navigator.userAgent}` : "";
  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        <LogoMark size={56} />
        <div>
          <Wordmark className="h-6 w-auto text-text" />
          <p className="mt-1 text-sm text-muted">Version {paths?.version}</p>
        </div>
      </div>
      <Section title="Diagnostics" description="Useful when reporting a problem. Contains no drawing content.">
        <pre className="my-3 whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-xs text-muted">{diagnostics}</pre>
        <div className="flex gap-2 py-3">
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard.writeText(diagnostics)}>
            Copy diagnostics
          </Button>
          {paths && (
            <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={() => void openPath(paths.dataDir)}>
              Open data folder
            </Button>
          )}
        </div>
      </Section>
      <Section title="Updates" description="Aven installs per user. Installing a newer version over this one keeps every workspace, setting and backup: they live outside the program folder (your workspace folders and %APPDATA%\\app.aven.desktop).">
        <p className="py-3 text-sm text-muted">This build has no automatic updater. To update, run the newer installer.</p>
      </Section>
      <Section title="Licenses">
        <div className="space-y-1.5 py-3 text-sm text-muted">
          <p>Aven is built on the open-source Excalidraw engine (MIT License, © Excalidraw contributors), Tauri (MIT/Apache-2.0), React (MIT), Zustand (MIT), Lucide icons (ISC), Figtree font (OFL 1.1) and the engine's fonts (OFL 1.1).</p>
          <Button size="sm" variant="ghost" onClick={() => void openExternal("https://github.com/excalidraw/excalidraw/blob/master/LICENSE")}>
            Excalidraw license
          </Button>
        </div>
      </Section>
    </>
  );
}

export function SettingsScreen() {
  const route = useUI((s) => s.route);
  const [tab, setTab] = useState<string>(route.name === "settings" && route.tab ? route.tab : "appearance");
  return (
    <div className="flex h-full bg-canvas">
      <aside className="island m-2 mr-0 flex w-64 shrink-0 flex-col p-2">
        <button onClick={() => useUI.getState().back()} className="mb-2 flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-muted hover:bg-hover hover:text-text cursor-pointer">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="font-display px-2.5 pb-2 text-2xl">Settings</h1>
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm cursor-pointer", tab === t.id ? "bg-accent-soft text-text font-[550]" : "text-muted hover:bg-hover hover:text-text")}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-3.5" />}
          onClick={async () => {
            if (await askConfirm({ title: "Reset all settings?", message: "Appearance, editor, export and shortcut preferences go back to their defaults. Workspaces and drawings are not touched.", confirmLabel: "Reset settings", danger: true }))
              useSettings.getState().reset();
          }}
        >
          Reset settings
        </Button>
      </aside>
      <main className="dot-grid min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-8 py-9">
          <h2 className="font-display mb-6 text-[2rem] leading-tight">{TABS.find((t) => t.id === tab)?.label}</h2>
          {tab === "appearance" && <Appearance />}
          {tab === "workspace" && <WorkspaceTab />}
          {tab === "backups" && <Backups />}
          {tab === "editor" && <EditorTab />}
          {tab === "shortcuts" && <ShortcutsTab />}
          {tab === "advanced" && <AdvancedTab />}
          {tab === "export" && <ExportTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "about" && <AboutTab />}
        </div>
      </main>
    </div>
  );
}
