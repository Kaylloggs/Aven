// Windows-first path helpers (also accept forward slashes).
export const SEP = "\\";

export function norm(p: string): string {
  return p.replace(/\//g, SEP).replace(/\\+$/, "") || p;
}

export function join(...parts: string[]): string {
  return norm(
    parts
      .filter(Boolean)
      .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
      .join(SEP),
  );
}

export function dirname(p: string): string {
  const n = norm(p);
  const i = n.lastIndexOf(SEP);
  return i <= 0 ? n : n.slice(0, i);
}

export function basename(p: string): string {
  const n = norm(p);
  return n.slice(n.lastIndexOf(SEP) + 1);
}

export function stem(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(0, i) : b;
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
}

export function isInside(child: string, parent: string): boolean {
  const c = norm(child).toLowerCase();
  const p = norm(parent).toLowerCase();
  return c === p || c.startsWith(p + SEP);
}

/** Relative path from `from` (a folder) to `to`, using forward slashes (for Markdown links). */
export function relativeUnix(from: string, to: string): string {
  const a = norm(from).split(SEP);
  const b = norm(to).split(SEP);
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  const up = a.slice(i).map(() => "..");
  return [...up, ...b.slice(i)].join("/") || ".";
}

/** Make a string safe as a Windows file name (mirrors the Rust `safe_name`). */
export function safeFileName(name: string): string {
  let out = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().replace(/[. ]+$/, "").trim();
  if (!out) out = "Untitled";
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(out)) out += "_";
  return out.slice(0, 120);
}
