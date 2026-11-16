import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, FolderPlus, Layers, Lock, LockOpen, MoreHorizontal, Plus, SquareStack } from "lucide-react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  addLayer,
  countByLayer,
  createLayerState,
  duplicateLayer,
  elementIdsInLayer,
  groupLayers,
  moveElementsToLayer,
  moveLayer,
  removeLayer,
  updateLayer,
} from "@/engine/layers";
import { cloneWithNewIds, withCustomData } from "@/engine/elements";
import type { LayerDef, LayerState } from "@/engine/types";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { openContextMenu, openMenuAt, type MenuItem } from "@/components/Menu";
import { askConfirm, askText } from "@/store/ui";
import { cx } from "@/lib/utils";
import { useEditor } from "../session";

function session() {
  return useEditor.getState().session!;
}

export function LayersPanel() {
  const layers = useEditor((s) => s.layers);
  const selection = useEditor((s) => s.selection);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const counts = useMemo(() => {
    const s = useEditor.getState().session;
    return layers && s?.api ? countByLayer(s.api.getSceneElements(), layers) : new Map<string, number>();
    // recount whenever the layer state or selection changes
  }, [layers, selection]);

  if (!layers)
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title="Organise with layers"
        body="Group what you draw into layers you can hide, lock, fade and reorder. Everything currently on the canvas goes into Layer 1."
        action={
          <Button
            variant="primary"
            onClick={() => {
              const s = session();
              const r = createLayerState(s.api!.getSceneElements());
              s.setLayers(r.state, r.elements);
            }}
          >
            Start using layers
          </Button>
        }
      />
    );

  const apply = (next: LayerState, scene?: any) => session().setLayers(next, scene);
  const scene = () => session().api!.getSceneElements();

  const rename = async (l: LayerDef) => {
    const name = await askText({ title: l.kind === "group" ? "Rename group" : "Rename layer", initial: l.name, confirmLabel: "Rename" });
    if (name) apply(updateLayer(layers, l.id, { name }));
  };

  const menuFor = (l: LayerDef): MenuItem[] => {
    const isGroup = l.kind === "group";
    return [
      { label: "Rename…", onSelect: () => rename(l) },
      ...(!isGroup
        ? ([
            { label: "Duplicate layer", onSelect: () => {
              const r = duplicateLayer(scene(), layers, l.id, (els, layerId) => cloneWithNewIds(els, { dx: 0, dy: 0 }).map((e) => withCustomData(e, { avenLayer: layerId })));
              apply(r.state, r.scene);
            } },
            { label: "Select everything on this layer", onSelect: () => {
              const ids = elementIdsInLayer(scene(), layers, l.id);
              session().api!.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((i) => [i, true])) } as any, captureUpdate: CaptureUpdateAction.NEVER });
            } },
            { label: "Move selection to this layer", disabled: !selection.length, onSelect: () => apply(layers, moveElementsToLayer(scene(), new Set(selection), l.id)) },
            {
              label: "Opacity",
              submenu: [100, 75, 50, 25].map((o) => ({ label: `${o}%`, checked: l.opacity === o, onSelect: () => apply(updateLayer(layers, l.id, { opacity: o })) })),
            },
            { label: "Add to new group", onSelect: () => apply(groupLayers(layers, [l.id], "Group")) },
            ...(l.parentId ? [{ label: "Remove from group", onSelect: () => apply(updateLayer(layers, l.id, { parentId: null })) }] : []),
            "separator",
            { label: "Delete layer, keep its elements", onSelect: () => {
              const r = removeLayer(scene(), layers, l.id, true);
              apply(r.state, r.scene);
            } },
            {
              label: "Delete layer and its elements",
              danger: true,
              onSelect: async () => {
                if (await askConfirm({ title: `Delete “${l.name}”?`, message: `The ${counts.get(l.id) ?? 0} element(s) on this layer will be deleted. Earlier versions stay available in Version history.`, confirmLabel: "Delete layer", danger: true })) {
                  const r = removeLayer(scene(), layers, l.id, false);
                  apply(r.state, r.scene);
                }
              },
            },
          ] as MenuItem[])
        : ([
            "separator",
            { label: "Ungroup", onSelect: () => apply(removeLayer(scene(), layers, l.id, true).state) },
          ] as MenuItem[])),
    ];
  };

  // top of the list = top of the stack
  const ordered = [...layers.layers].reverse();
  const visibleRows = ordered.filter((l) => {
    if (!l.parentId) return true;
    const p = layers.layers.find((g) => g.id === l.parentId);
    return !p?.collapsed;
  });
  const drawable = layers.layers.filter((l) => l.kind !== "group");

  const onDrop = (target: LayerDef) => {
    if (!dragId || dragId === target.id) return;
    const dragged = layers.layers.find((l) => l.id === dragId)!;
    let next = layers;
    if (target.kind === "group" && dragged.kind !== "group") {
      next = updateLayer(next, dragged.id, { parentId: target.id });
      const idx = next.layers.findIndex((l) => l.id === target.id);
      next = moveLayer(next, dragged.id, idx);
    } else {
      const targetIdx = next.layers.findIndex((l) => l.id === target.id);
      const fromIdx = next.layers.findIndex((l) => l.id === dragged.id);
      next = moveLayer(next, dragged.id, fromIdx < targetIdx ? targetIdx : targetIdx + 1);
      if (dragged.kind !== "group") next = updateLayer(next, dragged.id, { parentId: target.kind === "group" ? target.id : target.parentId ?? null });
    }
    apply(next);
  };

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 p-2" role="listbox" aria-label="Layers">
        {visibleRows.map((l) => {
          const isGroup = l.kind === "group";
          const active = layers.activeLayerId === l.id;
          return (
            <li
              key={l.id}
              role="option"
              aria-selected={active}
              draggable
              onDragStart={() => setDragId(l.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropOn(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropOn(l.id);
              }}
              onDrop={() => {
                onDrop(l);
                setDropOn(null);
              }}
              onClick={() => !isGroup && apply({ ...layers, activeLayerId: l.id })}
              onContextMenu={(e) => openContextMenu(e, menuFor(l))}
              onDoubleClick={() => rename(l)}
              className={cx(
                "group flex h-9 items-center gap-1 rounded-md pr-1 text-sm cursor-pointer select-none",
                l.parentId ? "pl-6" : "pl-1",
                active ? "bg-accent-soft text-text" : "hover:bg-hover",
                dropOn === l.id && dragId !== l.id && "ring-1 ring-accent",
                dragId === l.id && "opacity-50",
              )}
            >
              {isGroup ? (
                <button
                  aria-label={l.collapsed ? "Expand group" : "Collapse group"}
                  className="grid size-6 place-items-center text-muted hover:text-text cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    apply(updateLayer(layers, l.id, { collapsed: !l.collapsed }));
                  }}
                >
                  {l.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              ) : (
                <span className="grid size-6 place-items-center text-faint">
                  <SquareStack className="size-3.5" />
                </span>
              )}
              <span className={cx("flex-1 truncate", !l.visible && "text-faint", isGroup && "font-[600]")}>{l.name}</span>
              {!isGroup && <span className="text-2xs text-faint tabular-nums">{counts.get(l.id) ?? 0}</span>}
              {l.opacity < 100 && <span className="text-2xs text-faint">{l.opacity}%</span>}
              <IconButton
                label={l.locked ? "Unlock" : "Lock"}
                size="sm"
                className={cx(!l.locked && "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                onClick={(e) => {
                  e.stopPropagation();
                  apply(updateLayer(layers, l.id, { locked: !l.locked }));
                }}
              >
                {l.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              </IconButton>
              <IconButton
                label={l.visible ? "Hide" : "Show"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  apply(updateLayer(layers, l.id, { visible: !l.visible }));
                }}
              >
                {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-faint" />}
              </IconButton>
              <IconButton
                label="Layer options"
                size="sm"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  openMenuAt(e.currentTarget, menuFor(l), "end");
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      <div className="space-y-3 overflow-hidden border-t border-border p-3">
        {(() => {
          const act = layers.layers.find((l) => l.id === layers.activeLayerId);
          if (!act) return null;
          return (
            <label className="flex items-center gap-3 text-xs text-muted">
              <span className="w-24 truncate">Opacity · {act.name}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={act.opacity}
                aria-label={`Opacity of ${act.name}`}
                onChange={(e) => apply(updateLayer(layers, act.id, { opacity: Number(e.target.value) }))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="w-8 text-right tabular-nums">{act.opacity}%</span>
            </label>
          );
        })()}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => apply(addLayer(layers))}>
            Layer
          </Button>
          <Button size="sm" icon={<FolderPlus className="size-3.5" />} onClick={() => apply(groupLayers(layers, [], `Group ${layers.layers.filter((l) => l.kind === "group").length + 1}`))}>
            Group
          </Button>
          <Button size="sm" variant="ghost" disabled={!selection.length} onClick={() => apply(layers, moveElementsToLayer(scene(), new Set(selection), layers.activeLayerId))}>
            Move selection here
          </Button>
        </div>
        <p className="text-2xs text-faint">{drawable.length} layer{drawable.length === 1 ? "" : "s"}. New shapes go on the highlighted layer. Drag to reorder or into a group.</p>
      </div>
    </div>
  );
}
