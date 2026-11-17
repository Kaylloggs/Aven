// Canvas background, stored per drawing in `scene.appState.canvasStyle`: a tone (light or dark)
// with or without the dotted texture. Values written by older versions are still read:
//  - "dots":  dots in the interface theme's tone
//  - "paper": the light sheet
//  - "dark":  the dark sheet
// With dots the engine background is transparent and the app draws the texture behind it; without
// dots the light sheet is off-white and the dark sheet uses the engine's dark theme (which inverts
// a white background on screen).
export type CanvasTone = "light" | "dark";
export type CanvasStyle = "light" | "dark" | "light-dots" | "dark-dots" | "dots" | "paper";

export const PAPER_COLOR = "#f8f7f4";
export const EXPORT_FALLBACK_BG = "#ffffff";

export function hasDots(style: CanvasStyle): boolean {
  return style === "dots" || style.endsWith("-dots");
}

export function canvasTone(style: CanvasStyle, appTheme: CanvasTone): CanvasTone {
  if (style === "dots") return appTheme;
  return style === "paper" || style.startsWith("light") ? "light" : "dark";
}

export function makeStyle(tone: CanvasTone, dots: boolean): CanvasStyle {
  return dots ? (`${tone}-dots` as CanvasStyle) : tone;
}

export function backgroundFor(style: CanvasStyle): string {
  if (hasDots(style)) return "transparent";
  return style === "paper" || style === "light" ? PAPER_COLOR : "#ffffff";
}

export function themeFor(style: CanvasStyle, appTheme: CanvasTone): CanvasTone {
  return canvasTone(style, appTheme);
}

const KNOWN = new Set<string>(["light", "dark", "light-dots", "dark-dots", "dots", "paper"]);

export function inferStyle(appState: { canvasStyle?: string; viewBackgroundColor?: string }): CanvasStyle {
  if (appState.canvasStyle && KNOWN.has(appState.canvasStyle)) return appState.canvasStyle as CanvasStyle;
  return !appState.viewBackgroundColor || appState.viewBackgroundColor === "transparent" ? "dots" : "paper";
}

/** Background to use when rendering an export or thumbnail (never transparent unless asked). */
export function exportBackground(viewBackgroundColor: string): string {
  return !viewBackgroundColor || viewBackgroundColor === "transparent" ? EXPORT_FALLBACK_BG : viewBackgroundColor;
}

/** Dot spacing on screen for a zoom level: doubles when dots would get too dense. */
export function dotSpacing(zoom: number, base = 22): number {
  let s = base * zoom;
  while (s < 11) s *= 2;
  while (s > 88) s /= 2;
  return s;
}
