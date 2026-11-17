// Web links on the canvas: which ones the engine can play inside a drawing.

/** Services the engine can show inside the canvas (same list as the engine's own embeds). */
const EMBEDDABLE = ["youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com", "figma.com", "gist.github.com", "twitter.com", "x.com", "stackblitz.com", "val.town", "giphy.com", "reddit.com", "link.excalidraw.com"];

export function normaliseUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function isEmbeddableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
    return EMBEDDABLE.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
