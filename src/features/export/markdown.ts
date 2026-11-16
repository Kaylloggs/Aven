// Pure helpers that generate the Markdown notes and file names used by the Obsidian,
// Notion and Google Drive exports. Kept free of UI and IO so they are easy to test.

export interface NoteMeta {
  title: string;
  project?: string;
  tags: string[];
  description: string;
  created: number;
  updated: number;
  avenId: string;
  /** visible text from the drawing, one entry per text element */
  text: string[];
}

export function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Apply the user's filename pattern, then make it safe for Windows, Obsidian and Notion. */
export function exportFileName(pattern: string, v: { title: string; project?: string; date?: number }): string {
  const raw = pattern
    .replace("{title}", v.title)
    .replace("{project}", v.project ?? "Drawings")
    .replace("{date}", isoDate(v.date ?? Date.now()));
  return safeNoteName(raw);
}

/** Obsidian forbids  * " \ / < > : | ? # ^ [ ]  in note names; Windows forbids most of them too. */
export function safeNoteName(name: string): string {
  const out = name
    .replace(/[*"\\/<>:|?#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120);
  return out || "Untitled";
}

function yamlString(s: string) {
  return /^[\w .,()-]*$/.test(s) && s.trim() === s && s !== "" ? s : JSON.stringify(s);
}

function tagSafe(t: string) {
  return t.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_\-/]/gu, "");
}

export function frontmatter(m: NoteMeta, extra: Record<string, string> = {}): string {
  const lines = ["---", `title: ${yamlString(m.title)}`];
  if (m.project) lines.push(`project: ${yamlString(m.project)}`);
  lines.push(`created: ${isoDate(m.created)}`, `updated: ${isoDate(m.updated)}`);
  const tags = m.tags.map(tagSafe).filter(Boolean);
  if (tags.length) lines.push("tags:", ...tags.map((t) => `  - ${t}`));
  lines.push(`aven-id: ${m.avenId}`, "source: Aven");
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${yamlString(v)}`);
  lines.push("---", "");
  return lines.join("\n");
}

/** Encode a relative path for a standard Markdown link (spaces and parentheses break links). */
export function mdPath(rel: string): string {
  return rel
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/%2F/g, "/"))
    .join("/");
}

export interface ObsidianOptions {
  /** image path relative to the vault root, forward slashes */
  imageVaultPath: string;
  /** image path relative to the note's folder, forward slashes */
  imageRelPath: string;
  linkStyle: "wikilink" | "markdown";
  frontmatter: boolean;
  sourceVaultPath?: string;
  sourceRelPath?: string;
}

export function obsidianNote(m: NoteMeta, o: ObsidianOptions): string {
  const parts: string[] = [];
  if (o.frontmatter) parts.push(frontmatter(m));
  parts.push(`# ${m.title}`, "");
  if (m.description) parts.push(m.description, "");
  parts.push(o.linkStyle === "wikilink" ? `![[${o.imageVaultPath}]]` : `![${m.title}](${mdPath(o.imageRelPath)})`, "");
  if (m.text.length) {
    parts.push("## Text in this drawing", "");
    for (const t of m.text) parts.push(`- ${t.replace(/\s*\n\s*/g, " ")}`);
    parts.push("");
  }
  if (o.sourceVaultPath && o.sourceRelPath)
    parts.push(o.linkStyle === "wikilink" ? `Editable source: [[${o.sourceVaultPath}|${m.title}.aven]]` : `Editable source: [${m.title}.aven](${mdPath(o.sourceRelPath)})`, "");
  parts.push(`*Exported from Aven on ${isoDate(Date.now())}.*`, "");
  return parts.join("\n");
}

/** Markdown that Notion's "Import → Text & Markdown" understands (relative image links). */
export function notionMarkdown(m: NoteMeta, imageRelPath: string): string {
  const parts = [`# ${m.title}`, ""];
  const props: string[] = [];
  if (m.project) props.push(`Project: ${m.project}`);
  if (m.tags.length) props.push(`Tags: ${m.tags.join(", ")}`);
  props.push(`Created: ${isoDate(m.created)}`, `Updated: ${isoDate(m.updated)}`);
  parts.push(props.join("  \n"), "");
  if (m.description) parts.push(m.description, "");
  parts.push(`![${m.title}](${mdPath(imageRelPath)})`, "");
  if (m.text.length) {
    parts.push("## Text in this drawing", "");
    for (const t of m.text) parts.push(`- ${t.replace(/\s*\n\s*/g, " ")}`);
    parts.push("");
  }
  return parts.join("\n");
}

/** A short plain-text description used by Notion's API publish. */
export function plainSummary(m: NoteMeta): string {
  const bits = [m.description, m.project ? `Project: ${m.project}` : "", m.tags.length ? `Tags: ${m.tags.join(", ")}` : ""].filter(Boolean);
  return bits.join("\n");
}

export function drawingTexts(elements: readonly { type: string; isDeleted?: boolean; text?: string; originalText?: string; containerId?: string | null }[]): string[] {
  return elements
    .filter((e) => !e.isDeleted && e.type === "text")
    .map((e) => (e.originalText ?? e.text ?? "").trim())
    .filter((t, i, all) => t && all.indexOf(t) === i)
    .slice(0, 200);
}

/** Accept a raw id or a full Notion page URL. */
export function parsePageId(input: string): string {
  const m = input.trim().match(/([0-9a-f]{32})(?:[?#].*)?$/i) ?? input.trim().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].replace(/-/g, "") : input.trim();
}
