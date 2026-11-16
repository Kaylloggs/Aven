import { Check } from "lucide-react";
import type { CanvasStyle } from "@/engine/canvasStyle";
import { PAPER_COLOR } from "@/engine/canvasStyle";
import { cx } from "@/lib/utils";

export const CANVAS_STYLES: { value: CanvasStyle; label: string; hint: string }[] = [
  { value: "dots", label: "Dots", hint: "Dotted, follows the interface theme" },
  { value: "paper", label: "Off-white", hint: "Plain off-white sheet" },
  { value: "dark", label: "Dark", hint: "Plain dark sheet" },
];

/** Small swatch previews of the three canvas looks. */
export function CanvasSwatch({ style, className }: { style: CanvasStyle; className?: string }) {
  const bg = style === "dots" ? "var(--canvas-bg)" : style === "paper" ? PAPER_COLOR : "#141418";
  return (
    <span
      aria-hidden
      className={cx("inline-block rounded-md border border-border", className)}
      style={{
        background: bg,
        backgroundImage: style === "dots" ? "radial-gradient(circle at 1px 1px, var(--dot) 1px, transparent 0)" : undefined,
        backgroundSize: style === "dots" ? "7px 7px" : undefined,
      }}
    />
  );
}

export function CanvasStylePicker({ value, onChange }: { value: CanvasStyle; onChange: (v: CanvasStyle) => void }) {
  return (
    <div role="radiogroup" aria-label="Canvas background" className="flex gap-2">
      {CANVAS_STYLES.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          title={s.hint}
          onClick={() => onChange(s.value)}
          className={cx(
            "flex flex-col items-center gap-1.5 rounded-lg border p-1.5 text-xs cursor-pointer transition-colors",
            value === s.value ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:border-border-strong hover:text-text",
          )}
        >
          <span className="relative">
            <CanvasSwatch style={s.value} className="block h-9 w-14" />
            {value === s.value && <Check className="absolute right-1 top-1 size-3 rounded-full bg-accent p-0.5 text-on-accent" />}
          </span>
          {s.label}
        </button>
      ))}
    </div>
  );
}
