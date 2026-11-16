// Creating drawings from templates, saving drawings as templates, template import/export.
import { convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import { api, pickFile, pickSavePath } from "@/platform/api";
import { createDocument, newId, parseDocument, serializeDocument } from "@/engine/format";
import type { AvenDocument } from "@/engine/types";
import { newDrawingDocument, useWorkspace } from "@/store/workspace";
import { askText, openDrawing, toast } from "@/store/ui";
import { useEditor } from "@/features/editor/session";
import { closeEditorIfOpen } from "@/features/commands";
import { basename, join, safeFileName, stem } from "@/lib/path";
import { errorMessage } from "@/lib/utils";
import { BUILTIN_TEMPLATES, type TemplateDef } from "./builtin";

export function buildTemplateDocument(def: TemplateDef): AvenDocument {
  const board = def.build();
  const elements = convertToExcalidrawElements(board.els as any, { regenerateIds: true });
  const base = newDrawingDocument(def.name);
  return {
    ...base,
    scene: { ...base.scene, elements: elements as any },
    meta: { ...base.meta, templateId: def.id, tags: [...def.tags] },
  };
}

const previewCache = new Map<string, string>();

export async function templatePreview(key: string, doc: () => Promise<AvenDocument> | AvenDocument): Promise<string | null> {
  if (previewCache.has(key)) return previewCache.get(key)!;
  try {
    const d = await doc();
    if (!d.scene.elements.length) return null;
    const svg = await exportToSvg({
      elements: d.scene.elements,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      files: d.scene.files,
      exportPadding: 24,
      skipInliningFonts: true,
    });
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    previewCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

async function remember(id: string) {
  const ws = useWorkspace.getState();
  const recent = [id, ...(ws.tree?.state.recentTemplates ?? []).filter((x) => x !== id)].slice(0, 8);
  await ws.saveState({ recentTemplates: recent });
}

export async function createFromBuiltin(def: TemplateDef, dir: string, title?: string) {
  const doc = buildTemplateDocument(def);
  const name = title ?? def.name;
  doc.title = name;
  await closeEditorIfOpen();
  const path = await useWorkspace.getState().createDrawing(dir, name, doc);
  await remember(def.id);
  openDrawing(path);
}

export async function createFromCustom(templatePath: string, dir: string, title?: string) {
  try {
    const tpl = parseDocument(await api.drawingRead(templatePath), stem(templatePath));
    const name = title ?? tpl.title;
    const doc: AvenDocument = { ...tpl, id: newId(), title: name, createdAt: Date.now(), updatedAt: Date.now(), meta: { ...tpl.meta, isTemplate: undefined, templateCategory: undefined, templateId: tpl.id } };
    await closeEditorIfOpen();
    const path = await useWorkspace.getState().createDrawing(dir, name, doc);
    await remember(tpl.id);
    openDrawing(path);
  } catch (e) {
    toast({ kind: "error", title: "Could not use this template", message: errorMessage(e) });
  }
}

async function writeTemplate(doc: AvenDocument, category: string) {
  const tree = useWorkspace.getState().tree;
  if (!tree) return null;
  const dir = join(tree.info.path, "Templates", safeFileName(category || "Custom"));
  await api.dirCreate(dir);
  const tpl: AvenDocument = { ...doc, id: newId(), createdAt: Date.now(), updatedAt: Date.now(), meta: { ...doc.meta, isTemplate: true, templateCategory: category || "Custom" } };
  const path = await api.drawingCreate(dir, tpl.title, serializeDocument(tpl));
  await useWorkspace.getState().refresh();
  return path;
}

/** Save the drawing open in the editor as a reusable template. */
export async function saveAsTemplate() {
  const s = useEditor.getState().session;
  if (!s) return;
  await s.flush();
  const name = await askText({ title: "Save as template", label: "Template name", initial: s.doc.title, confirmLabel: "Continue" });
  if (!name) return;
  const category = await askText({ title: "Template category", label: "Category", initial: "Custom", confirmLabel: "Save template" });
  if (category === null) return;
  const path = await writeTemplate({ ...s.buildDocument(), title: name }, category);
  if (path) toast({ kind: "success", title: `Template “${name}” saved`, message: "Find it under My templates in the template gallery." });
}

export async function templateFromDrawing(drawingPath: string) {
  try {
    const doc = parseDocument(await api.drawingRead(drawingPath), stem(drawingPath));
    const name = await askText({ title: "Create template", label: "Template name", initial: doc.title, confirmLabel: "Continue" });
    if (!name) return;
    const category = await askText({ title: "Template category", label: "Category", initial: "Custom", confirmLabel: "Create template" });
    if (category === null) return;
    await writeTemplate({ ...doc, title: name }, category);
    toast({ kind: "success", title: `Template “${name}” created` });
  } catch (e) {
    toast({ kind: "error", title: "Could not create the template", message: errorMessage(e) });
  }
}

/** Copy a built-in template into My templates so it can be edited. */
export async function customizeBuiltin(def: TemplateDef) {
  const path = await writeTemplate(buildTemplateDocument(def), def.category);
  if (path) {
    await closeEditorIfOpen();
    openDrawing(path);
  }
}

export async function exportTemplate(src: { builtin?: TemplateDef; path?: string }) {
  const doc = src.builtin ? buildTemplateDocument(src.builtin) : parseDocument(await api.drawingRead(src.path!));
  const out = await pickSavePath("Export template", `${safeFileName(doc.title)}.aven`, [{ name: "Aven drawing", extensions: ["aven"] }]);
  if (!out) return;
  await api.fileWriteText(out, serializeDocument({ ...doc, meta: { ...doc.meta, isTemplate: true, templateCategory: src.builtin?.category ?? doc.meta.templateCategory ?? "Custom" } }));
  toast({ kind: "success", title: "Template exported", message: out });
}

/** Import .aven / .excalidraw files or an .aventemplates pack into My templates. */
export async function importTemplates() {
  const files = await pickFile("Import templates", [{ name: "Templates", extensions: ["aven", "excalidraw", "aventemplates", "json"] }], true);
  if (!files.length) return;
  let n = 0;
  for (const f of files) {
    try {
      const text = await api.fileReadText(f);
      const raw = JSON.parse(text);
      if (raw?.type === "aven-template-pack" && Array.isArray(raw.templates)) {
        for (const t of raw.templates) {
          const doc = parseDocument(JSON.stringify(t));
          if (await writeTemplate(doc, doc.meta.templateCategory ?? raw.name ?? "Imported")) n++;
        }
      } else {
        const doc = parseDocument(text, stem(f));
        if (await writeTemplate(doc, doc.meta.templateCategory ?? "Imported")) n++;
      }
    } catch (e) {
      toast({ kind: "error", title: `Could not import ${basename(f)}`, message: errorMessage(e) });
    }
  }
  if (n) toast({ kind: "success", title: `${n} template${n > 1 ? "s" : ""} imported` });
}

/** Export every personal template as one shareable pack. */
export async function exportTemplatePack() {
  const tree = useWorkspace.getState().tree;
  if (!tree?.templates.length) return toast({ kind: "info", title: "You have no personal templates yet" });
  const out = await pickSavePath("Export template pack", "My templates.aventemplates", [{ name: "Aven template pack", extensions: ["aventemplates"] }]);
  if (!out) return;
  const templates = [];
  for (const t of tree.templates) {
    try {
      templates.push(parseDocument(await api.drawingRead(t.path)));
    } catch {
      /* skip unreadable templates */
    }
  }
  await api.fileWriteText(out, JSON.stringify({ type: "aven-template-pack", version: 1, name: "My templates", templates }));
  toast({ kind: "success", title: `${templates.length} templates exported`, message: out });
}

export function findBuiltin(id: string) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

export { createDocument };
