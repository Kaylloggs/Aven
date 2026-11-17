import { canvasTone, hasDots, makeStyle, PAPER_COLOR, type CanvasStyle, type CanvasTone } from "@/engine/canvasStyle";
import type { MenuItem } from "@/components/Menu";
import { cx } from "@/lib/utils";
import { Segmented, Switch } from "./ui";

/** Small preview of a canvas background. */
export function CanvasSwatch({ tone, dots, className }: { tone: CanvasTone; dots: boolean; className?: string }) {
  const bg = tone === "light" ? PAPER_COLOR : "#141418";
  const dot = tone === "light" ? "#cfcfd6" : "#3a3a44";
  return (
    <span
      aria-hidden
      className={cx("inline-block rounded-md border border-border", className)}
      style={{
        background: bg,
        backgroundImage: dots ? `radial-gradient(circle at 1px 1px, ${dot} 1px, transparent 0)` : undefined,
        backgroundSize: dots ? "7px 7px" : undefined,
      }}
    />
  );
}

/** Light or dark, with or without dots. */
export function CanvasStylePicker({ value, appTheme, onChange }: { value: CanvasStyle; appTheme: CanvasTone; onChange: (v: CanvasStyle) => void }) {
  const tone = canvasTone(value, appTheme);
  const dots = hasDots(value);
  return (
    <div className="flex items-center gap-3">
      <CanvasSwatch tone={tone} dots={dots} className="h-9 w-14" />
      <Segmented
        label="Canvas colour"
        value={tone}
        onChange={(t) => onChange(makeStyle(t, dots))}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
      <label className="flex items-center gap-2 text-sm text-muted">
        <Switch label="Dots" checked={dots} onChange={(d) => onChange(makeStyle(tone, d))} /> Dots
      </label>
    </div>
  );
}

/** The same choice as menu items (canvas menus of the editor). */
export function canvasStyleItems(value: CanvasStyle, appTheme: CanvasTone, set: (v: CanvasStyle) => void): MenuItem[] {
  const tone = canvasTone(value, appTheme);
  const dots = hasDots(value);
  return [
    { label: "Light", checked: tone === "light", onSelect: () => set(makeStyle("light", dots)) },
    { label: "Dark", checked: tone === "dark", onSelect: () => set(makeStyle("dark", dots)) },
    "separator",
    { label: "Dots", checked: dots, onSelect: () => set(makeStyle(tone, !dots)) },
  ];
}
