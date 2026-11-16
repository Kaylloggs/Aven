import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Check, ChevronRight } from "lucide-react";
import { cx, shortcutLabel } from "@/lib/utils";

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      submenu?: MenuItem[];
      hint?: string;
    }
  | "separator"
  | { heading: string }
  | { swatches: MenuSwatch[]; title: string };

/** One colour in an inline swatch row: shows the colour itself, never its code. */
export interface MenuSwatch {
  color: string;
  name: string;
  checked?: boolean;
  onSelect: () => void;
}

interface MenuState {
  open: { x: number; y: number; items: MenuItem[]; anchor?: DOMRect; minWidth?: number } | null;
  show: (o: MenuState["open"]) => void;
  close: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}));

/** Open a menu below an element (dropdown) */
export function openMenuAt(el: HTMLElement, items: MenuItem[], align: "start" | "end" = "start") {
  const r = el.getBoundingClientRect();
  useMenuStore.getState().show({ x: align === "start" ? r.left : r.right, y: r.bottom + 4, items, anchor: r, minWidth: align === "end" ? -1 : r.width });
}

/** Open a context menu at the pointer */
export function openContextMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useMenuStore.getState().show({ x: e.clientX, y: e.clientY, items });
}

function MenuList({ items, x, y, alignEnd, onClose, minWidth, level = 0 }: { items: MenuItem[]; x: number; y: number; alignEnd?: boolean; onClose: () => void; minWidth?: number; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  const actionable = items.map((it, i) => (typeof it === "object" && "label" in it && !it.disabled ? i : -1)).filter((i) => i >= 0);
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Top layer: above modal dialogs and never clipped by a transformed or scrolling parent.
    try {
      if (!el.matches(":popover-open")) el.showPopover();
    } catch {
      /* popover API unavailable: stays a fixed element */
    }
    const r = el.getBoundingClientRect();
    let left = alignEnd ? x - r.width : x;
    let top = y;
    if (left + r.width > innerWidth - 8) left = innerWidth - r.width - 8;
    if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
    setPos({ left: Math.max(8, left), top });
    setPlaced(true);
    if (level === 0) el.focus();
  }, [x, y, alignEnd, level]);

  const run = (it: MenuItem, i: number, el?: HTMLElement | null) => {
    if (typeof it !== "object" || !("label" in it) || it.disabled) return;
    if (it.submenu) {
      const rect = (el ?? ref.current?.children[i] as HTMLElement)?.getBoundingClientRect();
      if (rect) setSub({ index: i, rect });
      return;
    }
    onClose();
    it.onSelect?.();
  };

  return (
    <>
      <div
        ref={ref}
        role="menu"
        popover="manual"
        tabIndex={-1}
        style={{ left: pos.left, top: pos.top, right: "auto", bottom: "auto", margin: 0, minWidth: minWidth && minWidth > 0 ? Math.max(200, minWidth) : 200, zIndex: 50 + level, visibility: placed ? undefined : "hidden" }}
        className="fixed max-h-[70vh] overflow-auto rounded-lg border border-border bg-raised p-1 shadow-[var(--shadow)] anim-pop outline-none"
        onKeyDown={(e) => {
          const swatch = (e.target as HTMLElement).dataset?.swatch !== undefined;
          if (swatch && (e.key === "Enter" || e.key === " ")) return; // let the focused swatch activate
          if (e.key === "Escape") {
            e.preventDefault(); // do not also close a dialog underneath
            e.stopPropagation();
            onClose();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const cur = actionable.indexOf(active);
            const next = e.key === "ArrowDown" ? actionable[(cur + 1) % actionable.length] : actionable[(cur - 1 + actionable.length) % actionable.length];
            setActive(next);
          } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault();
            if (active >= 0) run(items[active], active);
          }
        }}
      >
        {items.map((it, i) => {
          if (it === "separator") return <div key={i} role="separator" className="my-1 h-px bg-border" />;
          if ("swatches" in it)
            return (
              <div key={i} role="group" aria-label={it.title} className="flex flex-wrap gap-1.5 px-2.5 py-1.5" onMouseEnter={() => { setActive(-1); setSub(null); }}>
                {it.swatches.map((sw) => (
                  <button
                    key={sw.color}
                    type="button"
                    role="menuitemradio"
                    aria-checked={!!sw.checked}
                    aria-label={sw.name}
                    title={sw.name}
                    data-swatch=""
                    onClick={() => {
                      onClose();
                      sw.onSelect();
                    }}
                    style={{ background: sw.color }}
                    className={cx(
                      "grid size-6 place-items-center rounded-full cursor-pointer transition-transform duration-150 hover:scale-110 focus-visible:scale-110",
                      sw.checked ? "ring-2 ring-text ring-offset-2 ring-offset-raised" : "ring-1 ring-inset ring-black/10",
                    )}
                  >
                    {sw.checked && <Check className="size-3.5 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.4)]" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            );
          if ("heading" in it)
            return (
              <div key={i} className="px-2.5 pb-1 pt-2 text-2xs font-[600] text-faint">
                {it.heading}
              </div>
            );
          return (
            <button
              key={i}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onMouseEnter={(e) => {
                setActive(i);
                if (it.submenu) setSub({ index: i, rect: e.currentTarget.getBoundingClientRect() });
                else setSub(null);
              }}
              onClick={(e) => run(it, i, e.currentTarget)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 h-8 text-sm text-left cursor-pointer disabled:opacity-40 disabled:cursor-default",
                active === i && "bg-hover",
                it.danger ? "text-danger" : "text-text",
              )}
            >
              <span className="flex size-4 items-center justify-center text-muted [&>svg]:size-4">
                {it.checked !== undefined ? it.checked && <Check className="size-4 text-accent-text" /> : it.icon}
              </span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-xs text-faint truncate max-w-32">{it.hint}</span>}
              {it.shortcut && <span className="text-xs text-faint">{shortcutLabel(it.shortcut)}</span>}
              {it.submenu && <ChevronRight className="size-3.5 text-faint" />}
            </button>
          );
        })}
      </div>
      {sub && typeof items[sub.index] === "object" && "submenu" in (items[sub.index] as any) && (
        <MenuList items={(items[sub.index] as any).submenu} x={sub.rect.right + 2} y={sub.rect.top - 4} onClose={onClose} level={level + 1} />
      )}
    </>
  );
}

export function MenuHost() {
  const { open, close } = useMenuStore();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('[role="menu"]')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const t = setTimeout(() => {
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", close);
      window.addEventListener("resize", close);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
  if (!open) return null;
  // Inside a modal dialog everything else is inert, so the menu has to live in that dialog.
  const host = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((d) => d.matches(":modal")).at(-1) ?? document.body;
  return createPortal(<MenuList items={open.items} x={open.x} y={open.y} alignEnd={open.minWidth === -1} minWidth={open.minWidth} onClose={close} />, host);
}
