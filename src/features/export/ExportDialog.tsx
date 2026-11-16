import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Cloud, ExternalLink, FileDown, FolderOpen, Loader2, NotebookPen } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, Field, Input, Segmented, Select, Switch } from "@/components/ui";
import { api, openExternal, pickFolder, pickSavePath, revealInExplorer } from "@/platform/api";
import { DEFAULT_EXPORT, EXT, exportDocument, frameElements, renderThumbnail, type ExportFormat, type ExportOptions, type ExportScope } from "@/engine/export";
import { parseDocument } from "@/engine/format";
import type { AvenDocument } from "@/engine/types";
import { useSettings } from "@/store/settings";
import { projectFor, useWorkspace } from "@/store/workspace";
import { toast, useUI } from "@/store/ui";
import { useEditor } from "@/features/editor/session";
import { cx, errorMessage } from "@/lib/utils";
import { join, stem } from "@/lib/path";
import { copyPngToClipboard, exportNotionFolder, exportToDriveFolder, exportToObsidian, obsidianUri, publishToNotion, saveFiles, uploadToDrive, type DriveFormat } from "./actions";
import { exportFileName } from "./markdown";

type Tab = "file" | "obsidian" | "notion" | "gdrive";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "svg", label: "SVG" },
  { value: "pdf", label: "PDF" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "json", label: "JSON" },
  { value: "aven", label: "Aven" },
];

function useDocument(path?: string) {
  const [doc, setDoc] = useState<AvenDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const s = useEditor.getState().session;
    if (!path && s) return setDoc(s.buildDocument());
    if (!path) return setError("Open a drawing to export it.");
    api
      .drawingRead(path)
      .then((t) => setDoc(parseDocument(t, stem(path))))
      .catch((e) => setError(errorMessage(e)));
  }, [path]);
  return { doc, error };
}

export function ExportDialog({ tab: initialTab = "file", path }: { tab?: Tab; path?: string }) {
  const close = () => useUI.getState().setOverlay(null);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const tree = useWorkspace((s) => s.tree);
  const selection = useEditor((s) => (path ? [] : s.selection));
  const { doc, error } = useDocument(path);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; open?: () => void; openLabel?: string } | null>(null);
  const docPath = path ?? useEditor.getState().path;
  const project = projectFor(tree, docPath)?.meta.name;

  const [opts, setOpts] = useState<ExportOptions>(() => ({
    ...DEFAULT_EXPORT,
    format: settings.export.defaultFormat,
    scale: settings.export.defaultScale,
    background: settings.export.background,
    padding: settings.export.padding,
  }));
  const frames = useMemo(() => (doc ? frameElements(doc) : []), [doc]);
  const [frameIds, setFrameIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  useEffect(() => {
    if (doc) setFileName(exportFileName(settings.export.filenamePattern, { title: doc.title, project, date: Date.now() }));
  }, [doc, settings.export.filenamePattern, project]);

  const effective: ExportOptions = { ...opts, selectedIds: selection, frameIds };

  useEffect(() => {
    if (!doc) return;
    let alive = true;
    renderThumbnail(doc, 560).then((u) => alive && setPreview(u));
    return () => {
      alive = false;
    };
  }, [doc]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    try {
      await fn();
    } catch (e) {
      toast({ kind: "error", title: "Export failed", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- file
  const exportFile = () =>
    run(async () => {
      const files = await exportDocument(doc!, effective);
      const single = files.length === 1;
      let target: string | null;
      if (single) {
        const ext = EXT[opts.format];
        target = await pickSavePath("Export drawing", join(settings.export.lastFolder ?? "", `${fileName || doc!.title}.${ext}`), [{ name: opts.format.toUpperCase(), extensions: [ext] }]);
      } else target = await pickFolder(`Choose a folder for ${files.length} files`, settings.export.lastFolder ?? undefined);
      if (!target) return;
      if (single) files[0].name = fileName || files[0].name;
      const written = await saveFiles(files, target, single);
      update({ export: { lastFolder: single ? target.slice(0, target.lastIndexOf("\\")) : target } });
      setResult({ text: written.length === 1 ? `Saved ${written[0]}` : `Saved ${written.length} files to ${target}`, open: () => revealInExplorer(written[0]), openLabel: "Show in folder" });
    });

  // ---------------------------------------------------------------- obsidian
  const ob = settings.export.obsidian;
  const [vaults, setVaults] = useState<{ name: string; path: string; exists: boolean }[]>([]);
  useEffect(() => {
    if (tab === "obsidian") api.obsidianVaults().then(setVaults).catch(() => setVaults([]));
  }, [tab]);
  const exportObsidian = () =>
    run(async () => {
      if (!ob.vaultPath) throw new Error("Choose your Obsidian vault first.");
      if (!(await api.obsidianIsVault(ob.vaultPath))) throw new Error("That folder is not an Obsidian vault (no .obsidian folder inside).");
      const r = await exportToObsidian(doc!, {
        vault: ob.vaultPath,
        folder: ob.folder,
        attachments: ob.attachmentsFolder,
        imageFormat: ob.imageFormat,
        linkStyle: ob.linkStyle,
        frontmatter: ob.frontmatter,
        includeSource: ob.includeSource,
        noteName: fileName || doc!.title,
        project,
        options: effective,
      });
      setResult({ text: `Note written to ${r.notePath}`, open: () => openExternal(obsidianUri(ob.vaultPath!, r.notePath)), openLabel: "Open in Obsidian" });
    });

  // ---------------------------------------------------------------- notion
  const notion = settings.export.notion;
  const [notionConnected, setNotionConnected] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  useEffect(() => {
    api.integrationsStatus().then((s) => {
      setNotionConnected(s.notionConnected);
      setDriveConnected(s.gdriveConnected);
    }).catch(() => {});
  }, []);
  const exportNotion = () =>
    run(async () => {
      const parent = notion.folder ?? (await pickFolder("Where should the Notion-ready folder go?"));
      if (!parent) return;
      update({ export: { notion: { folder: parent } } });
      const dir = await exportNotionFolder(doc!, parent, effective, project, fileName);
      setResult({ text: `Folder ready: ${dir}. In Notion choose Import, then Text & Markdown, and pick the .md file.`, open: () => revealInExplorer(dir), openLabel: "Show folder" });
    });
  const publishNotion = () =>
    run(async () => {
      if (!notion.parentPageId.trim()) throw new Error("Paste the link or id of the Notion page to publish under.");
      const r = await publishToNotion(doc!, notion.parentPageId, effective, project);
      setResult({ text: "Published to Notion.", open: r.url ? () => openExternal(r.url) : undefined, openLabel: "Open page" });
    });

  // ---------------------------------------------------------------- google drive
  const gd = settings.export.gdrive;
  const [driveFolders, setDriveFolders] = useState<string[]>([]);
  const [driveFormats, setDriveFormats] = useState<DriveFormat[]>(["png", "pdf"]);
  const [driveSub, setDriveSub] = useState("Aven");
  useEffect(() => {
    if (tab === "gdrive") api.gdriveFolders().then(setDriveFolders).catch(() => setDriveFolders([]));
  }, [tab]);
  const exportDrive = () =>
    run(async () => {
      if (!driveFormats.length) throw new Error("Pick at least one format.");
      if (gd.mode === "folder") {
        const root = gd.folder ?? driveFolders[0];
        if (!root) throw new Error("Choose your Google Drive folder first.");
        const r = await exportToDriveFolder(doc!, root, driveSub, driveFormats, effective, settings.export.filenamePattern, project);
        setResult({ text: `${r.written.length} file(s) written to ${r.dir}. Google Drive for desktop uploads them automatically.`, open: () => revealInExplorer(r.written[0]), openLabel: "Show in folder" });
      } else {
        const r = await uploadToDrive(doc!, gd.apiFolderName || "Aven", driveFormats, effective, settings.export.filenamePattern, project);
        setResult({ text: `${r.length} file(s) uploaded to Google Drive › ${gd.apiFolderName || "Aven"}.`, open: r[0]?.url ? () => openExternal(r[0].url) : undefined, openLabel: "Open in Drive" });
      }
    });

  const scopeOptions: { value: ExportScope; label: string }[] = [
    { value: "all", label: "Whole canvas" },
    ...(selection.length ? [{ value: "selection" as const, label: `Selection (${selection.length})` }] : []),
    ...(frames.length ? [{ value: "frames" as const, label: `Frames (${frames.length})` }] : []),
  ];

  const commonOptions = (formats: "raster" | "any" = "any") => (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <Field label="What to export">
        <Select value={opts.scope} onChange={(e) => setOpts({ ...opts, scope: e.target.value as ExportScope })} aria-label="Export scope">
          {scopeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Resolution" hint={formats === "raster" || ["png", "jpeg", "webp", "pdf"].includes(opts.format) ? undefined : "Vector formats ignore resolution."}>
        <div className="flex items-center gap-2">
          <Segmented size="sm" label="Scale" value={String(opts.scale)} onChange={(v) => setOpts({ ...opts, scale: Number(v) })} options={["1", "2", "3", "4"].map((s) => ({ value: s, label: `${s}x` }))} />
          <Input
            type="number"
            min={0.25}
            max={8}
            step={0.25}
            value={opts.scale}
            aria-label="Custom scale"
            className="w-20"
            onChange={(e) => setOpts({ ...opts, scale: Math.min(8, Math.max(0.25, Number(e.target.value) || 1)) })}
          />
        </div>
      </Field>
      {opts.scope === "frames" && frames.length > 0 && (
        <div className="col-span-2">
          <p className="mb-1.5 text-xs font-[550] text-muted">Frames (none selected = all)</p>
          <div className="flex flex-wrap gap-1.5">
            {frames.map((f: any, i) => {
              const on = frameIds.includes(f.id);
              return (
                <button key={f.id} onClick={() => setFrameIds(on ? frameIds.filter((x) => x !== f.id) : [...frameIds, f.id])} className={cx("rounded-full border px-2.5 py-1 text-xs cursor-pointer", on ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:bg-hover")}>
                  {f.name || `Frame ${i + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Field label="Background" inline hint="Off gives a transparent PNG, WebP or SVG.">
        <Switch label="Include background" checked={opts.background} onChange={(v) => setOpts({ ...opts, background: v })} />
      </Field>
      <Field label="Dark version" inline>
        <Switch label="Export in dark mode" checked={opts.darkMode} onChange={(v) => setOpts({ ...opts, darkMode: v })} />
      </Field>
      <Field label="Padding (px)">
        <Input type="number" min={0} max={400} value={opts.padding} onChange={(e) => setOpts({ ...opts, padding: Math.max(0, Number(e.target.value) || 0) })} />
      </Field>
      <Field label="File name">
        <Input value={fileName} onChange={(e) => setFileName(e.target.value)} />
      </Field>
    </div>
  );

  const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: "file", label: "File", icon: <FileDown className="size-4" /> },
    { value: "obsidian", label: "Obsidian", icon: <NotebookPen className="size-4" /> },
    { value: "notion", label: "Notion", icon: <NotebookPen className="size-4" /> },
    { value: "gdrive", label: "Google Drive", icon: <Cloud className="size-4" /> },
  ];

  return (
    <Modal open onClose={close} bare width={920}>
      <div className="flex max-h-[calc(100vh-48px)]">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-surface-2 p-4 md:flex">
          <h2 className="text-md">Export</h2>
          <p className="mt-0.5 truncate text-sm text-muted">{doc?.title ?? "…"}</p>
          <div className="mt-4 grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-border bg-white">
            {preview ? <img src={preview} alt="Preview of the drawing" className="max-h-full max-w-full object-contain" /> : error ? <p className="p-4 text-xs text-danger">{error}</p> : <Loader2 className="size-5 animate-spin text-[#999]" />}
          </div>
          <nav className="mt-5 flex flex-col gap-0.5" aria-label="Export destination">
            {TABS.map((t) => (
              <button key={t.value} onClick={() => { setTab(t.value); setResult(null); }} className={cx("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm cursor-pointer", tab === t.value ? "bg-accent-soft text-text" : "text-muted hover:bg-hover hover:text-text")}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {tab === "file" && (
              <>
                <Field label="Format">
                  <Segmented label="Format" value={opts.format} onChange={(v) => setOpts({ ...opts, format: v })} options={FORMATS} />
                </Field>
                <p className="text-xs text-muted">
                  {
                    {
                      png: "Lossless image, supports transparency.",
                      svg: "Vector graphic that stays sharp at any size.",
                      pdf: "One page per export (one per frame when exporting frames). Pages are high-resolution images; use SVG for vector output.",
                      jpeg: "Small files for sharing; no transparency.",
                      webp: "Modern compressed image with transparency.",
                      json: "Scene file compatible with Excalidraw.",
                      aven: "Native Aven file with layers, components and links.",
                    }[opts.format]
                  }
                </p>
                {opts.format !== "json" && opts.format !== "aven" && commonOptions()}
                {(opts.format === "png" || opts.format === "svg") && (
                  <Field label="Embed editable scene" inline hint="The file can be dropped back onto a canvas and edited.">
                    <Switch label="Embed scene" checked={opts.embedScene} onChange={(v) => setOpts({ ...opts, embedScene: v })} />
                  </Field>
                )}
              </>
            )}

            {tab === "obsidian" && (
              <>
                <p className="text-sm text-muted">
                  Writes the image into your vault and a Markdown note that embeds it, with metadata in the frontmatter.{" "}
                  <button className="text-accent-text hover:underline cursor-pointer" onClick={() => useUI.getState().setOverlay({ kind: "guides", tab: "obsidian" })}>How to set this up</button>
                </p>
                <Field label="Vault">
                  <div className="flex gap-2">
                    <Select className="flex-1" value={ob.vaultPath ?? ""} onChange={(e) => update({ export: { obsidian: { vaultPath: e.target.value || null } } })} aria-label="Obsidian vault">
                      <option value="">Choose a vault…</option>
                      {[...vaults, ...(ob.vaultPath && !vaults.some((v) => v.path === ob.vaultPath) ? [{ name: ob.vaultPath, path: ob.vaultPath, exists: true }] : [])].map((v) => (
                        <option key={v.path} value={v.path} disabled={!v.exists}>
                          {v.name} {v.exists ? "" : "(missing)"}
                        </option>
                      ))}
                    </Select>
                    <Button icon={<FolderOpen className="size-4" />} onClick={async () => { const p = await pickFolder("Choose your Obsidian vault"); if (p) update({ export: { obsidian: { vaultPath: p } } }); }}>
                      Browse
                    </Button>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Note folder (inside the vault)">
                    <Input value={ob.folder} onChange={(e) => update({ export: { obsidian: { folder: e.target.value } } })} />
                  </Field>
                  <Field label="Attachments folder">
                    <Input value={ob.attachmentsFolder} onChange={(e) => update({ export: { obsidian: { attachmentsFolder: e.target.value } } })} />
                  </Field>
                  <Field label="Image format">
                    <Segmented label="Image format" value={ob.imageFormat} onChange={(v) => update({ export: { obsidian: { imageFormat: v } } })} options={[{ value: "png", label: "PNG" }, { value: "svg", label: "SVG" }]} />
                  </Field>
                  <Field label="Link style">
                    <Segmented label="Link style" value={ob.linkStyle} onChange={(v) => update({ export: { obsidian: { linkStyle: v } } })} options={[{ value: "wikilink", label: "![[Wikilink]]" }, { value: "markdown", label: "Markdown" }]} />
                  </Field>
                  <Field label="Note name">
                    <Input value={fileName} onChange={(e) => setFileName(e.target.value)} />
                  </Field>
                </div>
                <Field label="Frontmatter metadata" inline hint="Title, project, dates, tags and the Aven id.">
                  <Switch label="Frontmatter" checked={ob.frontmatter} onChange={(v) => update({ export: { obsidian: { frontmatter: v } } })} />
                </Field>
                <Field label="Copy the editable .aven file" inline hint="Stored next to the image so the vault holds the source too.">
                  <Switch label="Include source" checked={ob.includeSource} onChange={(v) => update({ export: { obsidian: { includeSource: v } } })} />
                </Field>
                {commonOptions()}
              </>
            )}

            {tab === "notion" && (
              <>
                <button className="text-sm text-accent-text hover:underline cursor-pointer" onClick={() => useUI.getState().setOverlay({ kind: "guides", tab: "notion" })}>How to set up Notion</button>
                <section className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-[650]">Notion-ready folder (works offline)</h3>
                  <p className="text-sm text-muted">Creates a folder with a Markdown page and the image. In Notion use Import, then Text & Markdown.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" icon={<FileDown className="size-4" />} loading={busy} disabled={!doc} onClick={exportNotion}>
                      Export folder
                    </Button>
                    <Button icon={<Clipboard className="size-4" />} disabled={!doc} onClick={() => run(async () => { await copyPngToClipboard(doc!, effective); setResult({ text: "Image copied. Paste it into any Notion page with Ctrl+V." }); })}>
                      Copy image
                    </Button>
                    {notion.folder && (
                      <button className="text-xs text-muted hover:text-text cursor-pointer underline-offset-2 hover:underline" onClick={async () => { const p = await pickFolder("Default folder for Notion exports"); if (p) update({ export: { notion: { folder: p } } }); }}>
                        Folder: {notion.folder}
                      </button>
                    )}
                  </div>
                </section>
                <section className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-[650]">Publish to a Notion page</h3>
                  {notionConnected ? (
                    <>
                      <Field label="Parent page link or id" hint="Share that page with your Notion integration first.">
                        <Input value={notion.parentPageId} placeholder="https://www.notion.so/…" onChange={(e) => update({ export: { notion: { parentPageId: e.target.value } } })} />
                      </Field>
                      <Button icon={<Cloud className="size-4" />} loading={busy} disabled={!doc} onClick={publishNotion}>
                        Publish page
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Optional. Add a Notion integration token in{" "}
                      <button className="text-accent-text hover:underline cursor-pointer" onClick={() => { close(); useUI.getState().navigate({ name: "settings", tab: "integrations" }); }}>
                        Settings › Integrations
                      </button>{" "}
                      to publish directly.
                    </p>
                  )}
                </section>
                {commonOptions()}
              </>
            )}

            {tab === "gdrive" && (
              <>
                <Field label="How to send files">
                  <Segmented
                    label="Google Drive mode"
                    value={gd.mode}
                    onChange={(v) => update({ export: { gdrive: { mode: v } } })}
                    options={[
                      { value: "folder", label: "Google Drive for desktop" },
                      { value: "api", label: "Upload with my Google account" },
                    ]}
                  />
                </Field>
                <button className="text-sm text-accent-text hover:underline cursor-pointer" onClick={() => useUI.getState().setOverlay({ kind: "guides", tab: "gdrive" })}>How to set up Google Drive</button>
                {gd.mode === "folder" ? (
                  <>
                    <p className="text-sm text-muted">Files are written into your synced Drive folder and uploaded by Google Drive for desktop. Works offline; uploads when you are back online.</p>
                    <Field label="Drive folder" hint={driveFolders.length ? undefined : "Google Drive for desktop was not detected. Choose its folder manually (for example G:\\My Drive)."}>
                      <div className="flex gap-2">
                        <Select className="flex-1" value={gd.folder ?? driveFolders[0] ?? ""} onChange={(e) => update({ export: { gdrive: { folder: e.target.value || null } } })} aria-label="Google Drive folder">
                          <option value="">Choose…</option>
                          {[...new Set([...driveFolders, ...(gd.folder ? [gd.folder] : [])])].map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </Select>
                        <Button icon={<FolderOpen className="size-4" />} onClick={async () => { const p = await pickFolder("Choose your Google Drive folder"); if (p) update({ export: { gdrive: { folder: p } } }); }}>
                          Browse
                        </Button>
                      </div>
                    </Field>
                    <Field label="Subfolder">
                      <Input value={driveSub} onChange={(e) => setDriveSub(e.target.value)} />
                    </Field>
                  </>
                ) : driveConnected ? (
                  <Field label="Drive folder name" hint="Aven creates it if needed and can only see files it created.">
                    <Input value={gd.apiFolderName} onChange={(e) => update({ export: { gdrive: { apiFolderName: e.target.value } } })} />
                  </Field>
                ) : (
                  <p className="text-sm text-muted">
                    Connect your Google account in{" "}
                    <button className="text-accent-text hover:underline cursor-pointer" onClick={() => { close(); useUI.getState().navigate({ name: "settings", tab: "integrations" }); }}>
                      Settings › Integrations
                    </button>{" "}
                    first, or use Google Drive for desktop.
                  </p>
                )}
                <Field label="Formats">
                  <div className="flex flex-wrap gap-1.5">
                    {(["png", "svg", "pdf", "aven"] as DriveFormat[]).map((f) => {
                      const on = driveFormats.includes(f);
                      return (
                        <button key={f} onClick={() => setDriveFormats(on ? driveFormats.filter((x) => x !== f) : [...driveFormats, f])} className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer", on ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:bg-hover")}>
                          {on && <Check className="size-3" />}
                          {f.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                {commonOptions()}
              </>
            )}
          </div>

          {result && (
            <div role="status" className="mx-5 mb-3 flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="flex-1 break-words text-muted">{result.text}</span>
              {result.open && (
                <button className="inline-flex shrink-0 items-center gap-1 text-accent-text hover:underline cursor-pointer" onClick={result.open}>
                  {result.openLabel} <ExternalLink className="size-3.5" />
                </button>
              )}
            </div>
          )}
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            {tab === "file" && (
              <Button variant="primary" loading={busy} disabled={!doc} icon={<FileDown className="size-4" />} onClick={exportFile}>
                Export {opts.format.toUpperCase()}
              </Button>
            )}
            {tab === "obsidian" && (
              <Button variant="primary" loading={busy} disabled={!doc || !ob.vaultPath} onClick={exportObsidian}>
                Export to vault
              </Button>
            )}
            {tab === "gdrive" && (
              <Button variant="primary" loading={busy} disabled={!doc || (gd.mode === "api" && !driveConnected)} onClick={exportDrive}>
                {gd.mode === "folder" ? "Save to Drive folder" : "Upload to Drive"}
              </Button>
            )}
          </footer>
        </div>
      </div>
    </Modal>
  );
}
