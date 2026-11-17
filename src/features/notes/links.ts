// Links between documents, written the way Obsidian writes them: [[Title]] or [[Title|shown text]].
// A link names a drawing, board or note by its title; when several share a title, the one closest
// to the note (same folder, then same project) wins.
import type { WorkspaceTree } from "@/platform/types";
import { allDocuments, docKind, type DocKind, type DrawingRef } from "@/store/workspace";
import { dirname } from "@/lib/path";

export const WIKILINK = /\[\[([^[\]|#^\n]+)(?:[#^][^[\]|\n]*)?(?:\|([^[\]\n]+))?\]\]/g;

export type LinkedDoc = DrawingRef & { kind: DocKind };

/** Link targets in a Markdown text, in order of appearance. */
export function wikilinkTargets(text: string): string[] {
  return [...text.matchAll(WIKILINK)].map((m) => m[1].trim());
}

/** Find the document a [[link]] points to, or null when nothing has that title. */
export function resolveLink(tree: WorkspaceTree | null, target: string, fromPath?: string): LinkedDoc | null {
  const name = target.trim().replace(/\.(md|aven|avenboard)$/i, "").toLowerCase();
  if (!name) return null;
  const docs = allDocuments(tree).filter((d) => d.title.toLowerCase() === name || stem(d.path).toLowerCase() === name);
  if (docs.length <= 1 || !fromPath) return docs[0] ?? null;
  const dir = dirname(fromPath).toLowerCase();
  const sameFolder = docs.find((d) => dirname(d.path).toLowerCase() === dir);
  if (sameFolder) return sameFolder;
  const from = allDocuments(tree).find((d) => d.path.toLowerCase() === fromPath.toLowerCase());
  return docs.find((d) => from?.project && d.project?.path === from.project.path) ?? docs[0];
}

/** Resolve a stored card link: by id for drawings and boards, by path for notes, then by title. */
export function findLinked(tree: WorkspaceTree | null, link: { id: string; title: string; path?: string; kind?: DocKind }): LinkedDoc | null {
  const docs = allDocuments(tree);
  return (
    docs.find((d) => d.id === link.id) ??
    (link.path ? docs.find((d) => d.path.toLowerCase() === link.path!.toLowerCase()) : undefined) ??
    docs.find((d) => d.title === link.title && d.kind === (link.kind ?? "drawing")) ??
    null
  );
}

/** A stable, file-name-safe key for a note (backups and the search index use it). */
export function noteKey(path: string): string {
  let h = 0x811c9dc5;
  for (const ch of path.toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `note-${h.toString(16).padStart(8, "0")}`;
}

export const KIND_LABEL: Record<DocKind, string> = { drawing: "Whiteboard", board: "Board", note: "Note" };

function stem(path: string) {
  return path.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
}

export { docKind };
