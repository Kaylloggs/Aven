import { useEffect, useState, type ReactNode } from "react";
import { Check, Cloud, ExternalLink, FolderOpen, NotebookPen, Settings2, Share2, Sparkles } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button } from "@/components/ui";
import { api, openExternal, pickFolder } from "@/platform/api";
import type { VaultInfo } from "@/platform/types";
import { useSettings } from "@/store/settings";
import { useUI } from "@/store/ui";
import { useEditor } from "@/features/editor/session";
import { cx } from "@/lib/utils";

export type GuideId = "obsidian" | "notion" | "gdrive";

function Step({ n, title, children, done }: { n: number; title: string; children?: ReactNode; done?: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-border last:hidden" />
      <span className={cx("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border text-sm font-[650]", done ? "border-success bg-success text-white" : "border-border-strong bg-surface-2 text-text")}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h4 className="text-sm font-[650] text-text">{title}</h4>
        {children && <div className="mt-1.5 space-y-2 text-sm text-muted [&_b]:font-[600] [&_b]:text-text">{children}</div>}
      </div>
    </li>
  );
}

function Option({ label, badge, children }: { label: string; badge?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="font-display text-lg">{label}</h3>
        {badge && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-[600] text-accent-text">{badge}</span>}
      </div>
      <ol>{children}</ol>
    </section>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => <span className="kbd">{children}</span>;

function openSettings() {
  useUI.getState().setOverlay(null);
  void useEditor.getState().session?.flush();
  useUI.getState().navigate({ name: "settings", tab: "integrations" });
}

function openExport(tab: "obsidian" | "notion" | "gdrive") {
  if (useEditor.getState().session) useUI.getState().setOverlay({ kind: "export", tab });
  else useUI.getState().setOverlay(null);
}

function ObsidianGuide() {
  const vault = useSettings((s) => s.settings.export.obsidian.vaultPath);
  const update = useSettings((s) => s.update);
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  useEffect(() => {
    api.obsidianVaults().then(setVaults).catch(() => setVaults([]));
  }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Aven writes the drawing as an image into your vault plus a Markdown note that embeds it. No plugin or account needed, and it works offline.</p>
      <Option label="Export into your vault" badge="Recommended">
        <Step n={1} title="Have an Obsidian vault" done={vaults.length > 0}>
          <p>A vault is just a folder. If you do not have one, install Obsidian and choose <b>Create new vault</b>.</p>
          {vaults.length > 0 ? (
            <p className="text-success">Aven found {vaults.length} vault{vaults.length > 1 ? "s" : ""}: {vaults.map((v) => v.name).join(", ")}.</p>
          ) : (
            <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal("https://obsidian.md/download")}>
              Download Obsidian
            </Button>
          )}
        </Step>
        <Step n={2} title="Choose the vault in Aven" done={!!vault}>
          <p>Aven lists the vaults Obsidian knows. You can also pick any vault folder (it contains a hidden <b>.obsidian</b> folder).</p>
          <div className="flex flex-wrap gap-2">
            {vaults.filter((v) => v.exists).map((v) => (
              <Button key={v.path} size="sm" variant={vault === v.path ? "primary" : "secondary"} onClick={() => update({ export: { obsidian: { vaultPath: v.path } } })}>
                {v.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={async () => { const p = await pickFolder("Choose your Obsidian vault"); if (p) update({ export: { obsidian: { vaultPath: p } } }); }}>
              Browse…
            </Button>
          </div>
          {vault && <p className="break-all text-xs text-faint">Selected: {vault}</p>}
        </Step>
        <Step n={3} title="Pick folders and link style">
          <p>By default notes go to <b>Aven</b> and images to <b>Aven/Attachments</b> inside the vault. Use <b>Wikilinks</b> if Obsidian's “Use [[Wikilinks]]” setting is on (it is by default), otherwise choose Markdown links.</p>
        </Step>
        <Step n={4} title="Export">
          <p>
            Open a drawing, click <b>Export</b> (<Kbd>Ctrl+Shift+E</Kbd>), choose <b>Obsidian</b>, then <b>Export to vault</b>. Use <b>Open in Obsidian</b> to jump to the note. Exporting again updates the same note and image.
          </p>
          <Button size="sm" icon={<Share2 className="size-3.5" />} disabled={!useEditor.getState().session} onClick={() => openExport("obsidian")}>
            Open the Obsidian export
          </Button>
        </Step>
      </Option>
    </div>
  );
}

function NotionGuide() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    api.integrationsStatus().then((s) => setConnected(s.notionConnected)).catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Three ways to get a drawing into Notion. The first two need no setup at all.</p>
      <Option label="Copy and paste" badge="Fastest">
        <Step n={1} title="Copy the image">
          <p>
            In a drawing: <b>Export › Notion › Copy image</b>, or select shapes and press <Kbd>Shift+Alt+C</Kbd> to copy them as PNG.
          </p>
        </Step>
        <Step n={2} title="Paste in Notion">
          <p>
            Click in any Notion page and press <Kbd>Ctrl+V</Kbd>.
          </p>
        </Step>
      </Option>
      <Option label="Import a Notion-ready page">
        <Step n={1} title="Export a folder from Aven">
          <p>
            <b>Export › Notion › Export folder</b> creates a folder with a Markdown page and its image.
          </p>
        </Step>
        <Step n={2} title="Import it in Notion">
          <p>
            In Notion open <b>Settings › Import</b> (or the <b>Import</b> item in the sidebar), choose <b>Text & Markdown</b> and select the <b>.md</b> file. The image is uploaded with it.
          </p>
        </Step>
      </Option>
      <Option label="Publish directly to a page" badge="Optional">
        <Step n={1} title="Create a Notion integration">
          <p>
            Open Notion's integrations page, click <b>New integration</b>, pick your workspace, keep the type <b>Internal</b>, name it “Aven” and save.
          </p>
          <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal("https://www.notion.so/profile/integrations")}>
            Open Notion integrations
          </Button>
        </Step>
        <Step n={2} title="Copy its secret into Aven" done={connected}>
          <p>
            Copy the <b>Internal Integration Secret</b>, then paste it in <b>Settings › Integrations › Notion</b> and click <b>Connect</b>. Aven checks it right away and stores it in Windows Credential Manager, never in its files.
          </p>
          <Button size="sm" icon={<Settings2 className="size-3.5" />} onClick={openSettings}>
            Open integration settings
          </Button>
        </Step>
        <Step n={3} title="Give the integration access to a page">
          <p>
            In Notion, open the page that should receive your drawings, click <b>•••</b> (top right) › <b>Connections</b> and add <b>Aven</b>.
          </p>
        </Step>
        <Step n={4} title="Publish">
          <p>
            Copy that page's link (<b>Share › Copy link</b>), paste it in <b>Export › Notion › Parent page</b>, then click <b>Publish page</b>. Aven creates a sub-page with the image and the drawing's description. If Notion refuses, its exact message is shown.
          </p>
        </Step>
      </Option>
    </div>
  );
}

function DriveGuide() {
  const [folders, setFolders] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const gd = useSettings((s) => s.settings.export.gdrive);
  const update = useSettings((s) => s.update);
  useEffect(() => {
    api.gdriveFolders().then(setFolders).catch(() => setFolders([]));
    api.integrationsStatus().then((s) => setConnected(s.gdriveConnected)).catch(() => {});
  }, []);
  const detected = gd.folder ?? folders[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Aven can drop exports into the folder that Google Drive for desktop keeps in sync, or upload them with your Google account.</p>
      <Option label="Google Drive for desktop" badge="Recommended">
        <Step n={1} title="Install Google Drive for desktop and sign in" done={folders.length > 0}>
          <p>It adds a drive to File Explorer (often <b>G:</b>) containing <b>My Drive</b> (“Mon Drive” in French).</p>
          {folders.length > 0 ? (
            <p className="text-success">Detected: {folders.join(", ")}</p>
          ) : (
            <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal("https://www.google.com/drive/download/")}>
              Download Google Drive for desktop
            </Button>
          )}
        </Step>
        <Step n={2} title="Confirm the folder" done={!!detected}>
          <p>Aven uses the detected folder. Pick another one if you prefer (any folder inside My Drive works).</p>
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-3.5" />} onClick={async () => { const p = await pickFolder("Choose your Google Drive folder", detected); if (p) update({ export: { gdrive: { folder: p, mode: "folder" } } }); }}>
            {detected ? `Using ${detected}` : "Choose folder…"}
          </Button>
        </Step>
        <Step n={3} title="Export">
          <p>
            <b>Export › Google Drive</b>, keep <b>Google Drive for desktop</b>, pick a subfolder and formats (PNG, SVG, PDF, .aven), then <b>Save to Drive folder</b>. Files upload in the background, and later if you are offline.
          </p>
          <Button size="sm" icon={<Share2 className="size-3.5" />} disabled={!useEditor.getState().session} onClick={() => openExport("gdrive")}>
            Open the Google Drive export
          </Button>
        </Step>
      </Option>
      <Option label="Upload with your Google account" badge="Advanced">
        <Step n={1} title="Create a Google Cloud project">
          <p>Google requires every app that signs in to Drive to have its own OAuth client. This takes about five minutes and is free.</p>
          <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal("https://console.cloud.google.com/projectcreate")}>
            Open Google Cloud Console
          </Button>
        </Step>
        <Step n={2} title="Enable the Google Drive API">
          <p>
            <b>APIs & Services › Library</b>, search “Google Drive API”, click <b>Enable</b>.
          </p>
        </Step>
        <Step n={3} title="Configure the consent screen">
          <p>
            <b>APIs & Services › OAuth consent screen</b>: user type <b>External</b>, app name “Aven”, your email, then add yourself under <b>Test users</b>.
          </p>
        </Step>
        <Step n={4} title="Create a Desktop client">
          <p>
            <b>Credentials › Create credentials › OAuth client ID</b>, application type <b>Desktop app</b>. Copy the <b>Client ID</b> and <b>Client secret</b>.
          </p>
        </Step>
        <Step n={5} title="Sign in from Aven" done={connected}>
          <p>
            Paste both in <b>Settings › Integrations › Google Drive</b> and click <b>Sign in with Google</b>. Your browser opens; approve access (Google may say the app is unverified because it is your own client: choose <b>Continue</b>). Aven only sees files it creates, in a Drive folder named “Aven”.
          </p>
          <Button size="sm" icon={<Settings2 className="size-3.5" />} onClick={openSettings}>
            Open integration settings
          </Button>
        </Step>
      </Option>
    </div>
  );
}

const GUIDES: { id: GuideId; label: string; icon: ReactNode; tint: string }[] = [
  { id: "obsidian", label: "Obsidian", icon: <NotebookPen className="size-4" />, tint: "var(--facet-violet)" },
  { id: "notion", label: "Notion", icon: <NotebookPen className="size-4" />, tint: "var(--text)" },
  { id: "gdrive", label: "Google Drive", icon: <Cloud className="size-4" />, tint: "var(--facet-blue)" },
];

export function IntegrationGuides({ initial = "obsidian" }: { initial?: GuideId }) {
  const [tab, setTab] = useState<GuideId>(initial);
  const close = () => useUI.getState().setOverlay(null);
  return (
    <Modal open onClose={close} bare width={920}>
      <div className="flex h-[min(760px,calc(100vh-48px))]">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-2 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <Sparkles className="size-5" />
          </span>
          <h2 className="font-display mt-3 text-xl leading-tight">Connect your tools</h2>
          <p className="mt-1 text-sm text-muted">Step-by-step setup for sending drawings to your notes and cloud.</p>
          <nav className="mt-5 flex flex-col gap-0.5" aria-label="Guides">
            {GUIDES.map((g) => (
              <button
                key={g.id}
                onClick={() => setTab(g.id)}
                style={{ ["--fold" as any]: g.tint }}
                className={cx("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm cursor-pointer", tab === g.id ? "bg-surface text-text font-[600] shadow-[var(--shadow-sm)]" : "text-muted hover:bg-hover hover:text-text")}
              >
                <span className={tab === g.id ? "text-[var(--fold)]" : ""}>{g.icon}</span>
                {g.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        </aside>
        <div className="dot-grid min-w-0 flex-1 overflow-y-auto p-6">
          <h3 className="font-display mb-4 text-[1.75rem] leading-tight">{GUIDES.find((g) => g.id === tab)?.label}</h3>
          {tab === "obsidian" && <ObsidianGuide />}
          {tab === "notion" && <NotionGuide />}
          {tab === "gdrive" && <DriveGuide />}
        </div>
      </div>
    </Modal>
  );
}
