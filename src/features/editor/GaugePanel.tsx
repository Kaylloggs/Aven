import { useMemo } from "react";
import { Check, CircleGauge, Gauge as GaugeIcon } from "lucide-react";
import { CaptureUpdateAction, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createGauge, GAUGE_COLORS, gaugeData, gaugeIdsIn, restyleGauge, setGaugeValue, type GaugeStyle } from "@/engine/gauge";
import { Segmented } from "@/components/ui";
import { cx } from "@/lib/utils";
import { useEditor } from "./session";
import { BarSep, FloatingBar } from "./FloatingBar";

/** Insert a new gauge at the centre of the visible canvas and select it. */
export function insertGauge(api: ExcalidrawImperativeAPI | null, style: GaugeStyle = "bar") {
  if (!api) return;
  const st = api.getAppState();
  const c = viewportCoordsToSceneCoords({ clientX: st.width / 2 + st.offsetLeft, clientY: st.height / 2 + st.offsetTop }, st);
  const els = createGauge(c.x - (style === "bar" ? 170 : 70), c.y - (style === "bar" ? 14 : 70), { style });
  api.updateScene({
    elements: [...api.getSceneElements(), ...els],
    appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])), selectedGroupIds: { [els[0].groupIds[0]]: true } } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
}

/** Floating controls shown while a gauge is selected. */
export function GaugePanel() {
  const selection = useEditor((s) => s.selection);
  const session = useEditor((s) => s.session);
  const sceneTick = useEditor((s) => s.sceneTick);
  const info = useMemo(() => {
    const api = session?.api;
    if (!api || !selection.length) return null;
    const scene = api.getSceneElements();
    const ids = gaugeIdsIn(scene, selection);
    if (!ids.length) return null;
    const track = scene.find((e) => gaugeData(e)?.gaugeId === ids[0] && gaugeData(e)?.role === "track");
    const d = track ? gaugeData(track) : null;
    return d ? { ids, value: d.value, color: d.color, style: d.style } : null;
    // recompute when the selection or the scene content changes
  }, [selection, session, sceneTick]);

  if (!info || !session?.api) return null;
  const api = session.api;
  const apply = (value: number, color = info.color, capture: "now" | "later" = "now") =>
    api.updateScene({
      elements: setGaugeValue(api.getSceneElements(), info.ids, value, color),
      captureUpdate: capture === "now" ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
    });

  return (
    <FloatingBar label="Gauge">
      <span className="flex items-center gap-1.5 px-1 text-xs font-[600] text-muted">
        <GaugeIcon className="size-4" /> Gauge{info.ids.length > 1 ? `s (${info.ids.length})` : ""}
      </span>
      <BarSep />
      <input
        type="range"
        min={0}
        max={100}
        value={info.value}
        aria-label="Percentage"
        onChange={(e) => apply(Number(e.target.value), info.color, "later")}
        onPointerUp={(e) => apply(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => apply(Number((e.target as HTMLInputElement).value))}
        className="w-40 accent-[var(--accent)]"
      />
      <label className="flex items-center gap-1 text-sm">
        <input
          type="number"
          min={0}
          max={100}
          value={info.value}
          aria-label="Percentage value"
          onChange={(e) => apply(Number(e.target.value) || 0)}
          onKeyDown={(e) => e.stopPropagation()}
          className="h-7 w-14 rounded-md border border-border bg-surface-2 px-1.5 text-right tabular-nums text-text focus:border-accent focus:outline-none"
        />
        %
      </label>
      <div className="flex gap-1" role="radiogroup" aria-label="Gauge colour">
        {GAUGE_COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={info.color === c}
            aria-label={c}
            onClick={() => apply(info.value, c)}
            className={cx("grid size-5 place-items-center rounded-full cursor-pointer", info.color === c && "ring-2 ring-[var(--text)] ring-offset-1 ring-offset-[var(--surface)]")}
            style={{ background: c }}
          >
            {info.color === c && <Check className="size-3 text-white" />}
          </button>
        ))}
      </div>
      {info.ids.length === 1 && (
        <Segmented
          size="sm"
          label="Gauge style"
          value={info.style}
          onChange={(s) => {
            const next = restyleGauge(api.getSceneElements(), info.ids[0], s);
            const ids = next.filter((e) => gaugeData(e)?.gaugeId && !api.getSceneElements().some((o) => o.id === e.id)).map((e) => e.id);
            api.updateScene({ elements: next, appState: { selectedElementIds: Object.fromEntries(ids.map((i) => [i, true])) } as any, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
          }}
          options={[
            { value: "bar", label: <GaugeIcon className="size-3.5" />, title: "Bar" },
            { value: "ring", label: <CircleGauge className="size-3.5" />, title: "Ring" },
          ]}
        />
      )}
    </FloatingBar>
  );
}
