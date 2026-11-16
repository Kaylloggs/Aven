// Export destinations: local files, Obsidian vaults, Notion and Google Drive.
import { exportToClipboard } from "@excalidraw/excalidraw";
import { api } from "@/platform/api";
import { bytesToBase64, exportDocument, type ExportedFile, type ExportOptions } from "@/engine/export";
import { serializeDocument } from "@/engine/format";
import type { AvenDocument } from "@/engine/types";
import { exportBackground } from "@/engine/canvasStyle";
import { join, relativeUnix } from "@/lib/path";
import { drawingTexts, exportFileName, notionMarkdown, obsidianNote, parsePageId, plainSummary, safeNoteName, type NoteMeta } from "./markdown";
export { parsePageId };

export function noteMeta(doc: AvenDocument, project?: string): NoteMeta {
  return {
    title: doc.title,
    project,
    tags: doc.meta.tags,
    description: doc.meta.description,
    created: doc.createdAt,
    updated: doc.updatedAt,
    avenId: doc.id,
    text: drawingTexts(doc.scene.elements as any),
  };
}

async function writeFile(path: string, f: ExportedFile) {
  await api.fileWriteBase64(path, bytesToBase64(f.data));
}

/** Write exported files. One file → `target` is a full path; several → `target` is a folder. */
export async function saveFiles(files: ExportedFile[], target: string, single: boolean): Promise<string[]> {
  const out: string[] = [];
  if (single && files.length === 1) {
    await writeFile(target, files[0]);
    return [target];
  }
  await api.dirCreate(target);
  for (const f of files) {
    const p = await api.uniqueFilePath(join(target, `${safeNoteName(f.name)}.${f.ext}`));
    await writeFile(p, f);
    out.push(p);
  }
  return out;
}

export interface ObsidianExport {
  vault: string;
  folder: string; // relative to vault, forward or back slashes
  attachments: string; // relative to vault
  imageFormat: "png" | "svg";
  linkStyle: "wikilink" | "markdown";
  frontmatter: boolean;
  includeSource: boolean;
  noteName: string;
  project?: string;
  options: ExportOptions;
}

const toVaultRel = (p: string) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export async function exportToObsidian(doc: AvenDocument, o: ObsidianExport): Promise<{ notePath: string; imagePath: string }> {
  const name = safeNoteName(o.noteName || doc.title);
  const [image] = await exportDocument(doc, { ...o.options, format: o.imageFormat, scope: o.options.scope === "frames" ? "all" : o.options.scope });
  const noteDir = join(o.vault, toVaultRel(o.folder));
  const attDir = join(o.vault, toVaultRel(o.attachments));
  await api.dirCreate(noteDir);
  await api.dirCreate(attDir);
  const imagePath = join(attDir, `${name}.${image.ext}`);
  await writeFile(imagePath, image); // re-exports replace the previous image on purpose
  let sourceVaultPath: string | undefined;
  let sourceRelPath: string | undefined;
  if (o.includeSource) {
    const src = join(attDir, `${name}.aven`);
    await api.fileWriteText(src, serializeDocument(doc));
    sourceVaultPath = [toVaultRel(o.attachments), `${name}.aven`].filter(Boolean).join("/");
    sourceRelPath = relativeUnix(noteDir, src);
  }
  const imageVaultPath = [toVaultRel(o.attachments), `${name}.${image.ext}`].filter(Boolean).join("/");
  const note = obsidianNote(noteMeta(doc, o.project), {
    imageVaultPath,
    imageRelPath: relativeUnix(noteDir, imagePath),
    linkStyle: o.linkStyle,
    frontmatter: o.frontmatter,
    sourceVaultPath,
    sourceRelPath,
  });
  const notePath = join(noteDir, `${name}.md`);
  await api.fileWriteText(notePath, note);
  return { notePath, imagePath };
}

export function obsidianUri(vault: string, notePath: string): string {
  return `obsidian://open?path=${encodeURIComponent(notePath)}&vault=${encodeURIComponent(vault.split("\\").pop() ?? "")}`;
}

/** A folder Notion can import (Import → Text & Markdown): `<name>/<name>.md` + image(s). */
export async function exportNotionFolder(doc: AvenDocument, parent: string, options: ExportOptions, project?: string, fileName?: string): Promise<string> {
  const name = safeNoteName(fileName || doc.title);
  const dir = await api.uniqueFilePath(join(parent, name));
  await api.dirCreate(dir);
  const [png] = await exportDocument(doc, { ...options, format: "png", scope: options.scope === "frames" ? "all" : options.scope });
  await writeFile(join(dir, `${name}.png`), png);
  if (options.format === "svg") {
    const [svg] = await exportDocument(doc, { ...options, format: "svg", scope: options.scope === "frames" ? "all" : options.scope });
    await writeFile(join(dir, `${name}.svg`), svg);
  }
  await api.fileWriteText(join(dir, `${name}.md`), notionMarkdown(noteMeta(doc, project), `${name}.png`));
  return dir;
}

export async function publishToNotion(doc: AvenDocument, parentPageId: string, options: ExportOptions, project?: string) {
  const [png] = await exportDocument(doc, { ...options, format: "png", scope: options.scope === "frames" ? "all" : options.scope });
  return api.notionPublish({
    parentPageId: parsePageId(parentPageId),
    title: doc.title,
    description: plainSummary(noteMeta(doc, project)),
    png: bytesToBase64(png.data),
    fileName: `${safeNoteName(doc.title)}.png`,
  });
}

export async function copyPngToClipboard(doc: AvenDocument, options: ExportOptions) {
  const live = doc.scene.elements.filter((e) => !e.isDeleted);
  const ids = new Set(options.selectedIds ?? []);
  const elements = options.scope === "selection" && ids.size ? live.filter((e) => ids.has(e.id) || ((e as any).containerId && ids.has((e as any).containerId))) : live;
  await exportToClipboard({
    elements,
    appState: { exportBackground: options.background, viewBackgroundColor: exportBackground(doc.scene.appState.viewBackgroundColor), exportWithDarkMode: options.darkMode, exportScale: options.scale },
    files: doc.scene.files,
    type: "png",
  });
}

export type DriveFormat = "png" | "svg" | "pdf" | "aven";

async function driveFiles(doc: AvenDocument, formats: DriveFormat[], options: ExportOptions, pattern: string, project?: string) {
  const base = exportFileName(pattern, { title: doc.title, project, date: Date.now() });
  const out: ExportedFile[] = [];
  for (const f of formats) {
    const files = await exportDocument(doc, { ...options, format: f, scope: f === "aven" ? "all" : options.scope === "frames" && f !== "pdf" ? "all" : options.scope });
    for (const file of files) out.push({ ...file, name: files.length > 1 ? file.name : base });
  }
  return out;
}

/** Google Drive for desktop: write into the synced folder; the Drive client uploads it. */
export async function exportToDriveFolder(doc: AvenDocument, driveRoot: string, sub: string, formats: DriveFormat[], options: ExportOptions, pattern: string, project?: string) {
  const dir = join(driveRoot, sub.replace(/\//g, "\\"));
  const files = await driveFiles(doc, formats, options, pattern, project);
  await api.dirCreate(dir);
  const written: string[] = [];
  for (const f of files) {
    const p = join(dir, `${safeNoteName(f.name)}.${f.ext}`);
    await writeFile(p, f);
    written.push(p);
  }
  return { dir, written };
}

/** Google Drive API: upload directly (requires a connected Google account). */
export async function uploadToDrive(doc: AvenDocument, folderName: string, formats: DriveFormat[], options: ExportOptions, pattern: string, project?: string) {
  const files = await driveFiles(doc, formats, options, pattern, project);
  return api.gdriveUpload(
    folderName,
    files.map((f) => ({ name: `${safeNoteName(f.name)}.${f.ext}`, mime: f.mime, data: bytesToBase64(f.data) })),
  );
}
