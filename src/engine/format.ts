// Serialisation, validation and versioned migration of `.aven` documents.
import { exportBackground, inferStyle } from "./canvasStyle";
import {
  AVEN_FORMAT_VERSION,
  AVEN_LINK_PREFIX,
  DEFAULT_APP_STATE,
  type AvenDocument,
  type BinaryFiles,
  type DrawingLink,
  type ExcalidrawElement,
  type SavedAppState,
} from "./types";

export const APP_VERSION = "1.5.0";

export class FormatError extends Error {}

export function newId(): string {
  return crypto.randomUUID();
}

export function createDocument(title: string, init?: Partial<AvenDocument>): AvenDocument {
  const now = Date.now();
  return {
    type: "aven-drawing",
    version: AVEN_FORMAT_VERSION,
    id: newId(),
    title: title.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
    app: { name: "Aven", version: APP_VERSION },
    scene: { elements: [], appState: { ...DEFAULT_APP_STATE }, files: {} },
    layers: null,
    components: [],
    links: [],
    meta: { tags: [], description: "" },
    ...init,
  };
}

/** Keep only image files that are still referenced, so documents do not grow forever. */
export function pruneFiles(doc: AvenDocument): BinaryFiles {
  const used = new Set<string>();
  const visit = (els: readonly ExcalidrawElement[]) => {
    for (const el of els) if (el.type === "image" && el.fileId) used.add(el.fileId);
  };
  visit(doc.scene.elements);
  visit(doc.layers?.hidden ?? []);
  for (const c of doc.components) visit(c.elements);
  const out: BinaryFiles = {};
  for (const [id, f] of Object.entries(doc.scene.files)) if (used.has(id)) out[id] = f;
  return out;
}

export function serializeDocument(doc: AvenDocument): string {
  const clean: AvenDocument = {
    ...doc,
    version: AVEN_FORMAT_VERSION,
    app: { name: "Aven", version: APP_VERSION },
    scene: {
      ...doc.scene,
      elements: doc.scene.elements.filter((e) => !e.isDeleted),
      files: pruneFiles(doc),
    },
  };
  return JSON.stringify(clean);
}

type Migration = (raw: any) => any;

/** Version N → N+1 migrations. Add a new entry whenever AVEN_FORMAT_VERSION is bumped. */
const MIGRATIONS: Record<number, Migration> = {
  // 0 = pre-release drafts that stored the scene at the top level
  0: (raw) => ({
    ...raw,
    version: 1,
    scene: raw.scene ?? { elements: raw.elements ?? [], appState: raw.appState ?? {}, files: raw.files ?? {} },
    layers: raw.layers ?? null,
    components: raw.components ?? [],
    links: raw.links ?? [],
    meta: raw.meta ?? { tags: [], description: "" },
  }),
};

export function migrate(raw: any): any {
  let doc = raw;
  let v = typeof doc.version === "number" ? doc.version : 0;
  if (v > AVEN_FORMAT_VERSION)
    throw new FormatError(
      `This drawing was saved by a newer version of Aven (format ${v}). Update Aven to open it.`,
    );
  while (v < AVEN_FORMAT_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new FormatError(`No migration from format ${v}.`);
    doc = step(doc);
    v = doc.version;
  }
  return doc;
}

function sanitizeAppState(a: any): SavedAppState {
  const s = { ...DEFAULT_APP_STATE };
  if (a && typeof a === "object") {
    if (typeof a.viewBackgroundColor === "string") s.viewBackgroundColor = a.viewBackgroundColor;
    s.canvasStyle = inferStyle(a);
    if (typeof a.gridSize === "number" && a.gridSize > 0) s.gridSize = a.gridSize;
    if (typeof a.gridStep === "number" && a.gridStep > 0) s.gridStep = a.gridStep;
    s.gridModeEnabled = !!a.gridModeEnabled;
    s.objectsSnapModeEnabled = !!a.objectsSnapModeEnabled;
    for (const k of ["scrollX", "scrollY", "zoom", "currentItemFontFamily", "currentItemRoughness", "currentItemStrokeWidth"] as const)
      if (typeof a[k] === "number" && Number.isFinite(a[k])) (s as any)[k] = a[k];
    for (const k of ["currentItemStrokeColor", "currentItemBackgroundColor"] as const)
      if (typeof a[k] === "string") (s as any)[k] = a[k];
  }
  return s;
}

/** Parse any supported file: native `.aven` (any version) or an Excalidraw `.excalidraw` scene. */
export function parseDocument(text: string, fallbackTitle = "Untitled"): AvenDocument {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new FormatError(`The file is damaged and cannot be read (${(e as Error).message}).`);
  }
  if (!raw || typeof raw !== "object") throw new FormatError("The file does not contain a drawing.");
  if (raw.type === "excalidraw") return fromExcalidrawScene(raw, fallbackTitle);
  if (raw.type !== "aven-drawing" && !(raw.elements && raw.version === undefined))
    throw new FormatError("This is not an Aven drawing.");
  const doc = migrate(raw);
  if (!Array.isArray(doc.scene?.elements)) throw new FormatError("The drawing has no element list.");
  return {
    type: "aven-drawing",
    version: AVEN_FORMAT_VERSION,
    id: typeof doc.id === "string" && doc.id ? doc.id : newId(),
    title: typeof doc.title === "string" && doc.title.trim() ? doc.title : fallbackTitle,
    createdAt: Number(doc.createdAt) || Date.now(),
    updatedAt: Number(doc.updatedAt) || Date.now(),
    app: { name: "Aven", version: String(doc.app?.version ?? APP_VERSION) as string } as AvenDocument["app"],
    scene: {
      elements: doc.scene.elements.filter((e: any) => e && typeof e === "object" && typeof e.type === "string"),
      appState: sanitizeAppState(doc.scene.appState),
      files: doc.scene.files && typeof doc.scene.files === "object" ? doc.scene.files : {},
    },
    layers:
      doc.layers && Array.isArray(doc.layers.layers) && doc.layers.layers.length
        ? { layers: doc.layers.layers, activeLayerId: doc.layers.activeLayerId, hidden: doc.layers.hidden ?? [] }
        : null,
    components: Array.isArray(doc.components) ? doc.components : [],
    links: Array.isArray(doc.links) ? doc.links : [],
    meta: {
      tags: Array.isArray(doc.meta?.tags) ? doc.meta.tags : [],
      description: typeof doc.meta?.description === "string" ? doc.meta.description : "",
      ...(doc.meta?.templateId ? { templateId: doc.meta.templateId } : {}),
      ...(doc.meta?.isTemplate ? { isTemplate: true, templateCategory: doc.meta.templateCategory ?? "Custom" } : {}),
    },
  };
}

export function fromExcalidrawScene(raw: any, title: string): AvenDocument {
  return createDocument(title, {
    scene: {
      elements: Array.isArray(raw.elements) ? raw.elements : [],
      appState: sanitizeAppState(raw.appState),
      files: raw.files ?? {},
    },
  });
}

/** Excalidraw-compatible scene JSON for interoperability. */
export function toExcalidrawScene(doc: AvenDocument): string {
  const hidden = doc.layers?.hidden ?? [];
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "https://aven.app",
      elements: [...doc.scene.elements, ...hidden].filter((e) => !e.isDeleted),
      appState: { viewBackgroundColor: exportBackground(doc.scene.appState.viewBackgroundColor), gridSize: doc.scene.appState.gridSize },
      files: pruneFiles(doc),
    },
    null,
    2,
  );
}

/** All human-readable text in a drawing, for the search index. */
export function extractText(doc: AvenDocument): string {
  const parts: string[] = [doc.title, doc.meta.description, ...doc.meta.tags];
  for (const el of [...doc.scene.elements, ...(doc.layers?.hidden ?? [])]) {
    if (el.isDeleted) continue;
    if (el.type === "text") parts.push((el as any).originalText ?? (el as any).text ?? "");
    if ((el.type === "frame" || el.type === "magicframe") && (el as any).name) parts.push((el as any).name);
  }
  return parts.filter(Boolean).join("\n").slice(0, 20000);
}

/** Drawing ids this document points to, from element links and explicit links. */
export function extractLinkTargets(doc: AvenDocument): { id: string; label: string }[] {
  const out = new Map<string, string>();
  for (const l of doc.links) if (l.kind !== "url") out.set(l.id, l.label);
  for (const el of doc.scene.elements) {
    const link = el.link;
    if (!el.isDeleted && link && link.startsWith(AVEN_LINK_PREFIX)) {
      const id = link.slice(AVEN_LINK_PREFIX.length).split(/[?#]/)[0];
      if (id && !out.has(id)) out.set(id, "");
    }
  }
  return [...out].map(([id, label]) => ({ id, label }));
}

export function drawingLink(id: string): string {
  return AVEN_LINK_PREFIX + id;
}

export function parseDrawingLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith(AVEN_LINK_PREFIX)) return null;
  return link.slice(AVEN_LINK_PREFIX.length).split(/[?#]/)[0] || null;
}

export function addLink(doc: AvenDocument, link: DrawingLink): AvenDocument {
  if (doc.links.some((l) => l.id === link.id && l.kind === link.kind)) return doc;
  return { ...doc, links: [...doc.links, link] };
}
