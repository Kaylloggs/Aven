import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { useAdvanced, useEditor } from "./session";
import { LayersPanel } from "./panels/LayersPanel";
import { ComponentsPanel } from "./panels/ComponentsPanel";
import { InfoPanel } from "./panels/InfoPanel";

const TITLES = { components: "Components", info: "Info and links" } as const;

function loadWidth() {
  try {
    return Math.min(520, Math.max(240, Number(localStorage.getItem("aven.dockWidth")) || 300));
  } catch {
    return 300;
  }
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
      <h2 className="font-display text-md">{title}</h2>
      <IconButton label={`Close ${title.toLowerCase()}`} size="sm" onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

/**
 * Right-hand floating panels. Info and Components open at the top; Layers is anchored at the
 * bottom right (like in design tools) and can stay open together with the others.
 */
export function RightDock() {
  const panel = useEditor((s) => s.panel);
  const layersOpen = useEditor((s) => s.layersOpen);
  const zen = useEditor((s) => s.zenMode);
  const adv = useAdvanced();
  const [width, setWidth] = useState(loadWidth);
  const drag = useRef<{ x: number; w: number } | null>(null);

  // panels whose feature was switched off close themselves
  useEffect(() => {
    if (panel === "components" && !adv.components) useEditor.setState({ panel: null });
    if (layersOpen && !adv.layers) useEditor.setState({ layersOpen: false });
  }, [panel, layersOpen, adv.layers, adv.components]);

  const showTop = !!panel && panel !== "layers";
  const showLayers = layersOpen && adv.layers;
  if (zen || (!showTop && !showLayers)) return null;

  return (
    <div style={{ width }} className="pointer-events-none absolute bottom-3 right-3 top-[68px] z-30 flex flex-col justify-end gap-3">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        className="pointer-events-auto absolute -left-1.5 top-0 bottom-0 z-10 w-1.5 cursor-col-resize rounded-full hover:bg-accent-soft"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setWidth(Math.min(520, Math.max(240, drag.current.w - (e.clientX - drag.current.x))));
        }}
        onPointerUp={() => {
          drag.current = null;
          try {
            localStorage.setItem("aven.dockWidth", String(width));
          } catch {
            /* ignore */
          }
        }}
      />
      {showTop && (
        <aside aria-label={TITLES[panel as keyof typeof TITLES]} className="island pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden anim-slide">
          <PanelHeader title={TITLES[panel as keyof typeof TITLES]} onClose={() => useEditor.setState({ panel: null })} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === "components" && <ComponentsPanel />}
            {panel === "info" && <InfoPanel />}
          </div>
        </aside>
      )}
      {showLayers && (
        <aside aria-label="Layers" className={`island pointer-events-auto flex min-h-[220px] flex-col overflow-hidden anim-slide ${showTop ? "max-h-[45%]" : "max-h-[60%]"}`}>
          <PanelHeader title="Layers" onClose={() => useEditor.setState({ layersOpen: false })} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LayersPanel />
          </div>
        </aside>
      )}
    </div>
  );
}
