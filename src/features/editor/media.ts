// Images, videos and links on the canvas: several images at once (picker or drag and drop),
// embedded videos and pages from the services the engine can show, and link cards for the rest.
import { CaptureUpdateAction, convertToExcalidrawElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { randomId } from "@/engine/elements";
import { isEmbeddableUrl, normaliseUrl } from "./urls";

type Point = { x: number; y: number };

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif)$/i;
const MAX_SIDE = 2400; // larger photos are scaled down before they go into the drawing
const SHOWN_SIDE = 360; // longest side of an inserted image on the canvas
const GAP = 24;

export const isImageFile = (f: File) => IMAGE_TYPES.test(f.type);

function readDataURL(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image could not be read."));
    img.src = src;
  });
}

/** Read an image file, scaling very large photos down; returns its data URL and natural size. */
async function prepare(f: File): Promise<{ dataURL: string; mimeType: string; width: number; height: number }> {
  const dataURL = await readDataURL(f);
  const img = await loadImage(dataURL);
  let width = img.naturalWidth || 300;
  let height = img.naturalHeight || 300;
  const raster = !/svg|gif/i.test(f.type);
  if (raster && Math.max(width, height) > MAX_SIDE) {
    const k = MAX_SIDE / Math.max(width, height);
    width = Math.round(width * k);
    height = Math.round(height * k);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    const type = /jpe?g/i.test(f.type) ? "image/jpeg" : "image/png";
    return { dataURL: canvas.toDataURL(type, 0.9), mimeType: type, width, height };
  }
  return { dataURL, mimeType: f.type || "image/png", width, height };
}

function viewportCenter(api: ExcalidrawImperativeAPI): Point {
  const st = api.getAppState();
  return viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
}

/** Lay the images out in rows (up to four per row) centred on `at`. Returns how many were added. */
export async function insertImages(api: ExcalidrawImperativeAPI, files: File[], at?: Point): Promise<number> {
  const images = files.filter(isImageFile);
  if (!images.length) return 0;
  const prepared = await Promise.all(images.map(prepare));
  const sized = prepared.map((p) => {
    const k = Math.min(1, SHOWN_SIDE / Math.max(p.width, p.height));
    return { ...p, w: Math.round(p.width * k), h: Math.round(p.height * k), id: randomId() };
  });
  const perRow = Math.min(4, sized.length);
  const rows: (typeof sized)[] = [];
  for (let i = 0; i < sized.length; i += perRow) rows.push(sized.slice(i, i + perRow));
  const rowW = rows.map((r) => r.reduce((s, p) => s + p.w, 0) + GAP * (r.length - 1));
  const rowH = rows.map((r) => Math.max(...r.map((p) => p.h)));
  const totalW = Math.max(...rowW);
  const totalH = rowH.reduce((s, h) => s + h, 0) + GAP * (rows.length - 1);
  const c = at ?? viewportCenter(api);
  const skeleton: any[] = [];
  let y = c.y - totalH / 2;
  rows.forEach((r, ri) => {
    let x = c.x - totalW / 2 + (totalW - rowW[ri]) / 2;
    for (const p of r) {
      skeleton.push({ type: "image", fileId: p.id, x, y: y + (rowH[ri] - p.h) / 2, width: p.w, height: p.h });
      x += p.w + GAP;
    }
    y += rowH[ri] + GAP;
  });
  api.addFiles(sized.map((p) => ({ id: p.id as any, dataURL: p.dataURL as any, mimeType: p.mimeType as any, created: Date.now() })));
  const els = convertToExcalidrawElements(skeleton);
  api.updateScene({
    elements: [...api.getSceneElements(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])) } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
  return els.length;
}

/** Open the system picker for one or several images, then insert them. */
export function pickImages(api: ExcalidrawImperativeAPI | null) {
  if (!api) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/avif";
  input.multiple = true;
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length) void insertImages(api, files);
  };
  input.click();
}

/** Drop several image files on the canvas: handled here, other files go to the engine as before. */
export function installImageDrop(host: HTMLElement, api: () => ExcalidrawImperativeAPI | null): () => void {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const onOver = (e: DragEvent) => {
    if (hasFiles(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent) => {
    const a = api();
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!a || !files.some(isImageFile)) return; // .excalidraw and library files: the engine handles them
    e.preventDefault();
    e.stopPropagation();
    const at = viewportCoordsToSceneCoords({ clientX: e.clientX, clientY: e.clientY }, a.getAppState());
    void insertImages(a, files, at);
  };
  host.addEventListener("dragover", onOver);
  host.addEventListener("drop", onDrop);
  return () => {
    host.removeEventListener("dragover", onOver);
    host.removeEventListener("drop", onDrop);
  };
}

// ------------------------------------------------------------------ videos and links

const isVideo = (url: string) => /youtube\.com|youtu\.be|vimeo\.com/i.test(url);

/** Insert a video or page from a link: playable inside the canvas when the service allows it, a link card otherwise. */
export function insertLink(api: ExcalidrawImperativeAPI | null, input: string): "embed" | "card" | null {
  if (!api) return null;
  const url = normaliseUrl(input);
  if (!url) return null;
  const c = viewportCenter(api);
  let els: any[];
  let kind: "embed" | "card";
  if (isEmbeddableUrl(url)) {
    const w = isVideo(url) ? 560 : 480;
    const h = isVideo(url) ? 315 : 360;
    // the engine builds embeds as a rectangle of type "embeddable" carrying the link
    const [base] = convertToExcalidrawElements([{ type: "rectangle", x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, strokeColor: "transparent", backgroundColor: "transparent", roundness: null } as any]);
    els = [{ ...base, type: "embeddable", link: url, roundness: null }];
    kind = "embed";
  } else {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    const label = rest ? `${host}\n${rest.length > 46 ? `${rest.slice(0, 45)}…` : rest}` : host;
    els = convertToExcalidrawElements([
      {
        type: "rectangle",
        x: c.x - 180,
        y: c.y - 44,
        width: 360,
        height: 88,
        roundness: { type: 3 },
        strokeColor: "#567bf7",
        backgroundColor: "#e7edff",
        fillStyle: "solid",
        roughness: 0,
        link: url,
        label: { text: label, fontSize: 18, fontFamily: 2, strokeColor: "#1e3a8a", textAlign: "left" },
      } as any,
    ]);
    kind = "card";
  }
  api.updateScene({
    elements: [...api.getSceneElements(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])) } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
  return kind;
}
