import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";
import { api } from "@/platform/api";
import type { LinkRow } from "@/platform/types";
import { allDrawings, useWorkspace } from "@/store/workspace";
import { openDrawing } from "@/store/ui";
import { EmptyState, PROJECT_COLORS, Segmented } from "@/components/ui";
import { cx } from "@/lib/utils";

interface Node {
  id: string;
  title: string;
  path: string;
  color: string;
  project: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

/** Force-directed map of drawings and the links between them. */
export function KnowledgeMap() {
  const tree = useWorkspace((s) => s.tree)!;
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [mode, setMode] = useState<"linked" | "all">("linked");
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [, frame] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    api.linksAll().then(setLinks).catch(() => setLinks([]));
  }, [tree]);

  const drawings = useMemo(() => allDrawings(tree), [tree]);
  const graph = useMemo(() => {
    const byId = new Map(drawings.map((d) => [d.id, d]));
    const edges = (links ?? []).filter((l) => byId.has(l.sourceId) && byId.has(l.targetId) && l.sourceId !== l.targetId);
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
      degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
    }
    const pool = mode === "linked" ? drawings.filter((d) => degree.has(d.id)) : drawings;
    const nodes: Node[] = pool.map((d, i) => {
      const a = (i / Math.max(1, pool.length)) * Math.PI * 2;
      const r = 120 + (i % 7) * 30;
      return {
        id: d.id,
        title: d.title,
        path: d.path,
        project: d.project?.meta.name ?? "Drawings",
        color: d.project ? PROJECT_COLORS[d.project.meta.color] ?? PROJECT_COLORS.coral : PROJECT_COLORS.graphite,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        degree: degree.get(d.id) ?? 0,
      };
    });
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId)) };
  }, [drawings, links, mode]);

  // simple force simulation (repulsion + springs + gravity), runs for a few hundred frames
  useEffect(() => {
    const { nodes, edges } = graph;
    const index = new Map(nodes.map((n) => [n.id, n]));
    let ticks = 0;
    let raf = 0;
    const step = () => {
      const alpha = Math.max(0.02, 1 - ticks / 300);
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const f = (2400 / d2) * alpha;
          dx *= f;
          dy *= f;
          a.vx += dx;
          a.vy += dy;
          b.vx -= dx;
          b.vy -= dy;
        }
      for (const e of edges) {
        const a = index.get(e.sourceId)!;
        const b = index.get(e.targetId)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 140) / d) * 0.04 * alpha;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.004 * alpha;
        n.vy -= n.y * 0.004 * alpha;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.6;
        n.vy *= 0.6;
      }
      frame((f) => f + 1);
      if (++ticks < 320) raf = requestAnimationFrame(step);
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      for (let i = 0; i < 320; i++) step();
    } else raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  if (links === null) return <main className="flex-1" />;

  const neighbors = new Set<string>();
  if (hover) for (const e of graph.edges) if (e.sourceId === hover || e.targetId === hover) neighbors.add(e.sourceId === hover ? e.targetId : e.sourceId);
  const index = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-8 py-5">
        <div>
          <h1 className="text-2xl">Knowledge map</h1>
          <p className="mt-1 text-sm text-muted">Drawings and the links between them. Add links from a drawing's Info panel or with shape links.</p>
        </div>
        <Segmented
          label="Show"
          value={mode}
          onChange={setMode}
          options={[
            { value: "linked", label: "Linked drawings" },
            { value: "all", label: "All drawings" },
          ]}
        />
      </header>
      {graph.nodes.length === 0 ? (
        <EmptyState
          icon={<Network className="size-5" />}
          title={mode === "linked" ? "No links yet" : "No drawings yet"}
          body={mode === "linked" ? "Open a drawing, then use Info › Link another drawing, or give a shape a link to another drawing. Connections appear here." : undefined}
        />
      ) : (
        <svg
          ref={svgRef}
          className="min-h-0 flex-1 cursor-grab active:cursor-grabbing"
          role="img"
          aria-label={`Map of ${graph.nodes.length} drawings and ${graph.edges.length} links`}
          onWheel={(e) => {
            const k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
            setView({ ...view, k });
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setView({ ...view, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) });
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <g transform={`translate(${(svgRef.current?.clientWidth ?? 800) / 2 + view.x} ${(svgRef.current?.clientHeight ?? 600) / 2 + view.y}) scale(${view.k})`}>
            {graph.edges.map((e, i) => {
              const a = index.get(e.sourceId)!;
              const b = index.get(e.targetId)!;
              const lit = hover && (e.sourceId === hover || e.targetId === hover);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? "var(--accent)" : "var(--border-strong)"} strokeWidth={lit ? 2 : 1.2} />;
            })}
            {graph.nodes.map((n) => {
              const dim = hover && hover !== n.id && !neighbors.has(n.id);
              const r = 7 + Math.min(10, n.degree * 2);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  className={cx("cursor-pointer transition-opacity", dim && "opacity-25")}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => openDrawing(n.path)}
                  role="link"
                  aria-label={`${n.title}, ${n.project}`}
                >
                  <circle r={r} fill={n.color} stroke="var(--bg)" strokeWidth={2} />
                  <text y={r + 14} textAnchor="middle" fontSize={12} fill="var(--text-muted)" style={{ pointerEvents: "none" }}>
                    {n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </main>
  );
}
