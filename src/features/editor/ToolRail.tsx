import {
  ArrowRight,
  ArrowLeftRight,
  Circle,
  CircleDot,
  Diamond,
  Eraser,
  Frame,
  Hand,
  ImagePlus,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Pencil,
  Presentation,
  RectangleHorizontal,
  Square,
  Type,
  Waypoints,
  Shapes,
} from "lucide-react";
import { IconButton } from "@/components/ui";
import { openMenuAt } from "@/components/Menu";
import { useSettings } from "@/store/settings";
import { bindingFor } from "@/features/shortcuts/registry";
import { cx } from "@/lib/utils";
import { useEditor } from "./session";
import { displayTool, setTool } from "./tools";
import { insertGauge } from "./GaugePanel";
import { CHART_KINDS, insertChart } from "./ChartPanel";
import { ChartColumn, Gauge, ListTree } from "lucide-react";
import { useUI } from "@/store/ui";

interface ToolDef {
  id: string;
  tool: string;
  label: string;
  icon: React.ReactNode;
}

const MAIN: (ToolDef | "sep")[] = [
  { id: "tool.selection", tool: "selection", label: "Select", icon: <MousePointer2 className="size-[18px]" /> },
  { id: "tool.hand", tool: "hand", label: "Hand", icon: <Hand className="size-[18px]" /> },
  "sep",
  { id: "tool.rectangle", tool: "rectangle", label: "Rectangle", icon: <Square className="size-[18px]" /> },
  { id: "tool.diamond", tool: "diamond", label: "Diamond", icon: <Diamond className="size-[18px]" /> },
  { id: "tool.ellipse", tool: "ellipse", label: "Ellipse", icon: <Circle className="size-[18px]" /> },
  { id: "tool.arrow", tool: "arrow", label: "Arrow", icon: <ArrowRight className="size-[18px]" /> },
  { id: "tool.line", tool: "line", label: "Line", icon: <Minus className="size-[18px]" /> },
  { id: "tool.freedraw", tool: "freedraw", label: "Draw", icon: <Pencil className="size-[18px]" /> },
  { id: "tool.text", tool: "text", label: "Text", icon: <Type className="size-[18px]" /> },
  { id: "tool.image", tool: "image", label: "Insert image", icon: <ImagePlus className="size-[18px]" /> },
  { id: "tool.eraser", tool: "eraser", label: "Eraser", icon: <Eraser className="size-[18px]" /> },
  "sep",
  { id: "tool.frame", tool: "frame", label: "Frame", icon: <Frame className="size-[18px]" /> },
  { id: "tool.connector", tool: "preset:connector", label: "Connector", icon: <Waypoints className="size-[18px]" /> },
  { id: "tool.laser", tool: "laser", label: "Laser pointer", icon: <Presentation className="size-[18px]" /> },
];

const MORE: ToolDef[] = [
  { id: "tool.square", tool: "preset:square", label: "Square", icon: <Square className="size-4" /> },
  { id: "tool.rounded", tool: "preset:rounded", label: "Rounded rectangle", icon: <RectangleHorizontal className="size-4" /> },
  { id: "tool.circle", tool: "preset:circle", label: "Circle", icon: <CircleDot className="size-4" /> },
  { id: "tool.doubleArrow", tool: "preset:double-arrow", label: "Double arrow", icon: <ArrowLeftRight className="size-4" /> },
];

export function ToolRail() {
  const active = displayTool(useEditor((s) => s.activeTool));
  const locked = useEditor((s) => s.toolLocked);
  const zen = useEditor((s) => s.zenMode);
  const shortcuts = useSettings((s) => s.settings.editor.shortcuts);
  const apiOf = () => useEditor.getState().session?.api ?? null;
  const moreActive = MORE.some((t) => t.tool === active);

  if (zen) return null;
  return (
    <nav aria-label="Drawing tools" className="island absolute left-3 top-[68px] z-30 flex max-h-[calc(100%-140px)] w-[52px] flex-col items-center gap-0.5 overflow-y-auto py-2 anim-fade">
      {MAIN.map((t, i) =>
        t === "sep" ? (
          <span key={i} aria-hidden className="my-1.5 h-px w-5 rounded-full bg-border" />
        ) : (
          <IconButton
            key={t.id}
            label={t.label}
            shortcut={bindingFor(t.id, shortcuts) || undefined}
            tipSide="right"
            active={active === t.tool}
            className={cx(active === t.tool && "!bg-accent !text-on-accent shadow-[var(--shadow-sm)]")}
            onClick={() => setTool(apiOf(), t.tool)}
          >
            {t.icon}
          </IconButton>
        ),
      )}
      <IconButton label="Diagram from text" shortcut={bindingFor("editor.textDiagram", shortcuts) || undefined} tipSide="right" onClick={() => useUI.getState().setOverlay({ kind: "textDiagram" })}>
        <ListTree className="size-[18px]" />
      </IconButton>
      <IconButton
        label="Chart or table"
        tipSide="right"
        onClick={(e) => openMenuAt(e.currentTarget, CHART_KINDS.map((k) => ({ label: k.label, icon: k.icon, onSelect: () => insertChart(apiOf(), k.value) })))}
      >
        <ChartColumn className="size-[18px]" />
      </IconButton>
      <IconButton label="Percentage gauge" shortcut={bindingFor("editor.insertGauge", shortcuts) || undefined} tipSide="right" onClick={() => insertGauge(apiOf())}>
        <Gauge className="size-[18px]" />
      </IconButton>
      <IconButton
        label="More shapes"
        tipSide="right"
        active={moreActive}
        onClick={(e) =>
          openMenuAt(
            e.currentTarget,
            MORE.map((t) => ({ label: t.label, icon: t.icon, shortcut: bindingFor(t.id, shortcuts) || undefined, onSelect: () => setTool(apiOf(), t.tool) })),
          )
        }
      >
        <Shapes className="size-[18px]" />
      </IconButton>
      <span aria-hidden className="my-1.5 h-px w-5 rounded-full bg-border" />
      <IconButton
        label={locked ? "Tool stays active (click to release)" : "Keep tool active after drawing"}
        shortcut="Q"
        tipSide="right"
        active={locked}
        className={cx(!locked && "opacity-70")}
        onClick={() => {
          const a = apiOf();
          if (!a) return;
          const t = a.getAppState().activeTool;
          a.setActiveTool({ type: t.type === "custom" ? "selection" : (t.type as any), locked: !t.locked });
        }}
      >
        {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
      </IconButton>
    </nav>
  );
}
