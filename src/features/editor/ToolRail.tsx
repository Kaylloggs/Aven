import {
  ArrowLeftRight,
  ArrowRight,
  Circle,
  CircleDot,
  Diamond,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Presentation,
  RectangleHorizontal,
  Square,
  Type,
  Waypoints,
} from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui";
import { openMenuAt, type MenuItem } from "@/components/Menu";
import { useSettings } from "@/store/settings";
import { useUI } from "@/store/ui";
import { bindingFor } from "@/features/shortcuts/registry";
import { cx } from "@/lib/utils";
import { useEditor } from "./session";
import { displayTool, setTool } from "./tools";
import { insertGauge } from "./GaugePanel";
import { CHART_KINDS, insertChart } from "./ChartPanel";

interface ToolDef {
  id: string;
  tool: string;
  label: string;
  icon: React.ReactNode;
}

const ic = (C: React.ComponentType<{ className?: string }>) => <C className="size-[18px]" />;

const SELECT: ToolDef = { id: "tool.selection", tool: "selection", label: "Select", icon: ic(MousePointer2) };
const HAND: ToolDef = { id: "tool.hand", tool: "hand", label: "Hand", icon: ic(Hand) };
const TEXT: ToolDef = { id: "tool.text", tool: "text", label: "Text", icon: ic(Type) };

/** Tools that do the same kind of job share one button; it remembers the last one used. */
const SLOTS: { id: string; label: string; tools: ToolDef[] }[] = [
  {
    id: "shapes",
    label: "Shapes",
    tools: [
      { id: "tool.rectangle", tool: "rectangle", label: "Rectangle", icon: ic(Square) },
      { id: "tool.ellipse", tool: "ellipse", label: "Ellipse", icon: ic(Circle) },
      { id: "tool.diamond", tool: "diamond", label: "Diamond", icon: ic(Diamond) },
      { id: "tool.rounded", tool: "preset:rounded", label: "Rounded rectangle", icon: ic(RectangleHorizontal) },
      { id: "tool.square", tool: "preset:square", label: "Square", icon: ic(Square) },
      { id: "tool.circle", tool: "preset:circle", label: "Circle", icon: ic(CircleDot) },
    ],
  },
  {
    id: "lines",
    label: "Arrows and lines",
    tools: [
      { id: "tool.arrow", tool: "arrow", label: "Arrow", icon: ic(ArrowRight) },
      { id: "tool.connector", tool: "preset:connector", label: "Connector", icon: ic(Waypoints) },
      { id: "tool.doubleArrow", tool: "preset:double-arrow", label: "Double arrow", icon: ic(ArrowLeftRight) },
      { id: "tool.line", tool: "line", label: "Line", icon: ic(Minus) },
    ],
  },
  {
    id: "draw",
    label: "Draw",
    tools: [
      { id: "tool.freedraw", tool: "freedraw", label: "Pen", icon: ic(Pencil) },
      { id: "tool.eraser", tool: "eraser", label: "Eraser", icon: ic(Eraser) },
      { id: "tool.laser", tool: "laser", label: "Laser pointer", icon: ic(Presentation) },
    ],
  },
];

const SLOT_KEY = "aven.toolSlots";
function loadSlots(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SLOT_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

const apiOf = () => useEditor.getState().session?.api ?? null;

function toggleToolLock() {
  const a = apiOf();
  if (!a) return;
  const t = a.getAppState().activeTool;
  a.setActiveTool({ type: t.type === "custom" ? "selection" : (t.type as any), locked: !t.locked });
}

export function ToolRail() {
  const active = displayTool(useEditor((s) => s.activeTool));
  const locked = useEditor((s) => s.toolLocked);
  const zen = useEditor((s) => s.zenMode);
  const shortcuts = useSettings((s) => s.settings.editor.shortcuts);
  const [remembered, setRemembered] = useState(loadSlots);
  const keyOf = (t: ToolDef) => bindingFor(t.id, shortcuts) || undefined;

  const pick = (slotId: string, t: ToolDef) => {
    setTool(apiOf(), t.tool);
    const next = { ...remembered, [slotId]: t.tool };
    setRemembered(next);
    try {
      localStorage.setItem(SLOT_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the slot simply forgets */
    }
  };

  const insertMenu = (el: HTMLElement) =>
    openMenuAt(el, [
      { label: "Image", shortcut: bindingFor("tool.image", shortcuts) || undefined, onSelect: () => setTool(apiOf(), "image") },
      { label: "Frame", shortcut: bindingFor("tool.frame", shortcuts) || undefined, onSelect: () => setTool(apiOf(), "frame") },
      "separator",
      { label: "Diagram from text…", shortcut: bindingFor("editor.textDiagram", shortcuts) || undefined, onSelect: () => useUI.getState().setOverlay({ kind: "textDiagram" }) },
      { label: "Chart or table", submenu: CHART_KINDS.map((k) => ({ label: k.label, onSelect: () => insertChart(apiOf(), k.value) })) },
      { label: "Percentage gauge", shortcut: bindingFor("editor.insertGauge", shortcuts) || undefined, onSelect: () => insertGauge(apiOf()) },
    ]);

  if (zen) return null;

  const plain = (t: ToolDef) => (
    <IconButton
      key={t.id}
      label={t.label}
      shortcut={keyOf(t)}
      tipSide="right"
      active={active === t.tool}
      className={cx(active === t.tool && "!bg-accent !text-on-accent shadow-[var(--shadow-sm)]")}
      onClick={() => setTool(apiOf(), t.tool)}
    >
      {t.icon}
    </IconButton>
  );

  return (
    <nav aria-label="Drawing tools" className="island absolute left-3 top-[68px] z-30 flex w-[52px] flex-col items-center gap-0.5 py-2 anim-fade">
      {plain(SELECT)}
      {plain(HAND)}
      <span aria-hidden className="my-1.5 h-px w-5 rounded-full bg-border" />
      {SLOTS.map((slot) => {
        const on = slot.tools.find((t) => t.tool === active);
        const current = on ?? slot.tools.find((t) => t.tool === remembered[slot.id]) ?? slot.tools[0];
        const menu = (el: HTMLElement) =>
          openMenuAt(el, [
            ...slot.tools.map<MenuItem>((t) => ({ label: t.label, icon: t.icon, shortcut: keyOf(t), onSelect: () => pick(slot.id, t) })),
            "separator",
            { label: "Keep tool active", checked: locked, shortcut: "Q", onSelect: toggleToolLock },
          ]);
        return (
          <IconButton
            key={slot.id}
            label={on ? `${current.label} (click for more ${slot.label.toLowerCase()})` : current.label}
            shortcut={keyOf(current)}
            tipSide="right"
            active={!!on}
            aria-haspopup="menu"
            className={cx("relative", on && "!bg-accent !text-on-accent shadow-[var(--shadow-sm)]")}
            // first click picks the tool, a click on the active tool (or a right-click) shows its variants
            onClick={(e) => (on ? menu(e.currentTarget) : pick(slot.id, current))}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              menu(e.currentTarget);
            }}
          >
            {current.icon}
            <span aria-hidden className="pointer-events-none absolute bottom-[5px] right-[5px] size-[5px] bg-current opacity-45 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
          </IconButton>
        );
      })}
      {plain(TEXT)}
      <span aria-hidden className="my-1.5 h-px w-5 rounded-full bg-border" />
      <IconButton label="Insert image, frame, diagram, chart or gauge" tipSide="right" aria-haspopup="menu" active={active === "image" || active === "frame"} onClick={(e) => insertMenu(e.currentTarget)}>
        <Plus className="size-[18px]" />
      </IconButton>
    </nav>
  );
}
