// Export pipeline: PNG / JPEG / WebP / SVG / PDF / JSON from an Aven document.
import { exportToBlob, exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import { buildPdf, type PdfPage } from "./pdf";
import { serializeDocument, toExcalidrawScene } from "./format";
import type { AvenDocument, BinaryFiles, ExcalidrawElement } from "./types";
import { exportBackground } from "./canvasStyle";

export type ExportFormat = "png" | "jpeg" | "webp" | "svg" | "pdf" | "json" | "aven";
export type ExportScope = "all" | "selection" | "frames";

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  /** element ids when scope = "selection" */
  selectedIds?: string[];
  /** frame ids when scope = "frames" (one file / page per frame) */
  frameIds?: string[];
  scale: number;
  background: boolean;
  darkMode: boolean;
  padding: number;
  /** embed the editable scene in PNG/SVG metadata */
  embedScene: boolean;
  jpegQuality: number;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: "png",
  scope: "all",
  scale: 2,
  background: true,
  darkMode: false,
  padding: 24,
  embedScene: false,
  jpegQuality: 0.92,
};

export interface ExportedFile {
  /** suggested file name without extension */
  name: string;
  ext: string;
  mime: string;
  data: Uint8Array;
}

export const MIME: Record<ExportFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  json: "application/json",
  aven: "application/vnd.aven+json",
};

export const EXT: Record<ExportFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  svg: "svg",
  pdf: "pdf",
  json: "excalidraw",
  aven: "aven",
};

export function frameElements(doc: AvenDocument): ExcalidrawElement[] {
  return doc.scene.elements.filter((e) => !e.isDeleted && (e.type === "frame" || e.type === "magicframe"));
}

function selectionWithChildren(els: readonly ExcalidrawElement[], ids: ReadonlySet<string>): ExcalidrawElement[] {
  const groupIds = new Set<string>();
  for (const el of els) if (ids.has(el.id)) el.groupIds.forEach((g) => groupIds.add(g));
  return els.filter(
    (el) =>
      !el.isDeleted &&
      (ids.has(el.id) ||
        ((el as any).containerId && ids.has((el as any).containerId)) ||
        (el.frameId && ids.has(el.frameId)) ||
        el.groupIds.some((g) => groupIds.has(g))),
  );
}

interface Job {
  name: string;
  elements: ExcalidrawElement[];
  frame: ExcalidrawElement | null;
}

function jobs(doc: AvenDocument, o: ExportOptions): Job[] {
  const live = doc.scene.elements.filter((e) => !e.isDeleted);
  if (o.scope === "selection") {
    const sel = selectionWithChildren(live, new Set(o.selectedIds ?? []));
    if (!sel.length) throw new Error("Select something on the canvas to export a selection.");
    return [{ name: `${doc.title} (selection)`, elements: sel, frame: null }];
  }
  if (o.scope === "frames") {
    const frames = frameElements(doc).filter((f) => !o.frameIds?.length || o.frameIds.includes(f.id));
    if (!frames.length) throw new Error("This drawing has no frames to export.");
    return frames.map((f, i) => ({
      name: `${doc.title} - ${(f as any).name || `Frame ${i + 1}`}`,
      elements: live.filter((e) => e.id === f.id || e.frameId === f.id),
      frame: f,
    }));
  }
  if (!live.length) throw new Error("The canvas is empty.");
  return [{ name: doc.title, elements: live, frame: null }];
}

function appStateFor(doc: AvenDocument, o: ExportOptions) {
  return {
    exportBackground: o.background,
    viewBackgroundColor: exportBackground(doc.scene.appState.viewBackgroundColor),
    exportWithDarkMode: o.darkMode,
    exportEmbedScene: o.embedScene,
    exportScale: o.scale,
  };
}

async function blobToBytes(b: Blob) {
  return new Uint8Array(await b.arrayBuffer());
}

export async function renderSvg(doc: AvenDocument, job: Job, o: ExportOptions, files: BinaryFiles): Promise<string> {
  const svg = await exportToSvg({
    elements: job.elements,
    appState: appStateFor(doc, o),
    files,
    exportPadding: o.padding,
    exportingFrame: job.frame as any,
  });
  return new XMLSerializer().serializeToString(svg);
}

export async function exportDocument(doc: AvenDocument, o: ExportOptions): Promise<ExportedFile[]> {
  const files = doc.scene.files;
  if (o.format === "aven") return [{ name: doc.title, ext: "aven", mime: MIME.aven, data: new TextEncoder().encode(serializeDocument(doc)) }];
  if (o.format === "json") return [{ name: doc.title, ext: EXT.json, mime: MIME.json, data: new TextEncoder().encode(toExcalidrawScene(doc)) }];

  const list = jobs(doc, o);
  if (o.format === "svg") {
    const out: ExportedFile[] = [];
    for (const j of list) out.push({ name: j.name, ext: "svg", mime: MIME.svg, data: new TextEncoder().encode(await renderSvg(doc, j, o, files)) });
    return out;
  }
  if (o.format === "pdf") {
    const pages: PdfPage[] = [];
    for (const j of list) {
      const canvas = await exportToCanvas({
        elements: j.elements,
        appState: { ...appStateFor(doc, o), exportBackground: true },
        files,
        exportPadding: o.padding,
        exportingFrame: j.frame as any,
        getDimensions: (w: number, h: number) => ({ width: w * o.scale, height: h * o.scale, scale: o.scale }),
      });
      const ctx = canvas.getContext("2d")!;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      pages.push({
        widthPt: (canvas.width / o.scale) * 0.75,
        heightPt: (canvas.height / o.scale) * 0.75,
        pixels: img.data,
        pxWidth: canvas.width,
        pxHeight: canvas.height,
        background: hexToRgb(o.darkMode ? "#121212" : exportBackground(doc.scene.appState.viewBackgroundColor)),
      });
    }
    const data = await buildPdf(pages, { title: doc.title });
    return [{ name: doc.title, ext: "pdf", mime: MIME.pdf, data }];
  }
  // raster formats
  const out: ExportedFile[] = [];
  for (const j of list) {
    const transparentOk = o.format !== "jpeg";
    const blob = await exportToBlob({
      elements: j.elements,
      appState: { ...appStateFor(doc, o), exportBackground: transparentOk ? o.background : true },
      files,
      exportPadding: o.padding,
      exportingFrame: j.frame as any,
      mimeType: MIME[o.format],
      quality: o.jpegQuality,
      getDimensions: (w: number, h: number) => ({ width: w * o.scale, height: h * o.scale, scale: o.scale }),
    });
    out.push({ name: j.name, ext: EXT[o.format], mime: MIME[o.format], data: await blobToBytes(blob) });
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Small PNG preview for dashboards and cards (returns a data URL, or null for empty drawings). */
export async function renderThumbnail(doc: AvenDocument, maxSize = 520): Promise<string | null> {
  const live = doc.scene.elements.filter((e) => !e.isDeleted);
  if (!live.length) return null;
  const blob = await exportToBlob({
    elements: live,
    appState: { exportBackground: true, viewBackgroundColor: exportBackground(doc.scene.appState.viewBackgroundColor), exportWithDarkMode: false },
    files: doc.scene.files,
    exportPadding: 16,
    maxWidthOrHeight: maxSize,
    mimeType: "image/png",
  });
  return bytesToDataUrl(await blobToBytes(blob), "image/png");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
