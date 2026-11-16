// The three canvas looks Aven offers. Stored per drawing in `scene.appState.canvasStyle`.
//  - dots:  the app's dotted texture (follows the interface theme); the engine background is transparent
//  - paper: off-white sheet
//  - dark:  dark sheet (engine dark theme, which inverts a white background on screen)
export type CanvasStyle = "dots" | "paper" | "dark";

export const PAPER_COLOR = "#f8f7f4";
export const EXPORT_FALLBACK_BG = "#ffffff";

export function backgroundFor(style: CanvasStyle): string {
  return style === "dots" ? "transparent" : style === "paper" ? PAPER_COLOR : "#ffffff";
}

export function themeFor(style: CanvasStyle, appTheme: "light" | "dark"): "light" | "dark" {
  return style === "dots" ? appTheme : style === "dark" ? "dark" : "light";
}

export function inferStyle(appState: { canvasStyle?: string; viewBackgroundColor?: string }): CanvasStyle {
  if (appState.canvasStyle === "dots" || appState.canvasStyle === "paper" || appState.canvasStyle === "dark") return appState.canvasStyle;
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
