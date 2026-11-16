import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useUI } from "@/store/ui";
import { cx } from "@/lib/utils";
import { Button, Input } from "./ui";

/** Accessible modal on top of the native <dialog> element (focus trap + Esc for free). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
  className,
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  bare?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable element (often the close button), which would
      // make Enter cancel a prompt. Put focus on the first text field instead when there is one.
      const field = d.querySelector<HTMLElement>("input:not([type=hidden]):not([type=range]):not([type=color]), textarea");
      if (field) requestAnimationFrame(() => field.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className={cx(
        "m-auto max-h-[calc(100vh-48px)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-text shadow-[var(--shadow)] anim-pop backdrop:anim-fade",
        className,
      )}
    >
      {bare ? (
        children
      ) : (
        <div className="flex max-h-[calc(100vh-48px)] flex-col">
          {title && (
            <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-md">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button aria-label="Close" onClick={onClose} className="-mr-1 rounded-md p-1 text-muted hover:bg-hover hover:text-text cursor-pointer">
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>,
    document.body,
  );
}

/** Renders the promise-based prompt / confirm requests from the UI store. */
export function PromptHost() {
  const req = useUI((s) => s.prompt);
  const [value, setValue] = useState("");
  useEffect(() => setValue(req?.initial ?? ""), [req]);
  if (!req) return null;
  const done = (v: string | boolean | null) => {
    req.resolve(v);
    useUI.setState({ prompt: null });
  };
  const submit = () => (req.kind === "prompt" ? value.trim() && done(value.trim()) : done(true));
  return (
    <Modal
      open
      onClose={() => done(req.kind === "prompt" ? null : false)}
      title={req.title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(req.kind === "prompt" ? null : false)}>
            Cancel
          </Button>
          <Button variant={req.danger ? "danger" : "primary"} onClick={submit} disabled={req.kind === "prompt" && !value.trim()}>
            {req.confirmLabel ?? (req.kind === "prompt" ? "Save" : "Confirm")}
          </Button>
        </>
      }
    >
      {req.message && <div className="text-sm text-muted mb-3">{req.message}</div>}
      {req.kind === "prompt" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {req.label && <label className="mb-1.5 block text-xs font-[550] text-muted">{req.label}</label>}
          <Input autoFocus value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
        </form>
      )}
    </Modal>
  );
}

const ICON = {
  info: <Info className="size-4 text-accent-text" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-danger" />,
  warning: <AlertTriangle className="size-4 text-warning" />,
};

export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2" style={{ zIndex: 60 }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-raised px-3.5 py-3 shadow-[var(--shadow)] anim-slide">
          <span className="mt-0.5">{ICON[t.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-[550] text-text">{t.title}</p>
            {t.message && <p className="mt-0.5 text-xs text-muted break-words">{t.message}</p>}
          </div>
          {t.action && (
            <button
              className="text-sm font-[600] text-accent-text hover:underline cursor-pointer"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-faint hover:text-text cursor-pointer">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** One shared tooltip for every element with `data-tip` (cheap: no per-button state). */
export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; kbd?: string; x: number; y: number; side: string } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const side = el.dataset.tipSide ?? "bottom";
      const pos =
        side === "right" ? { x: r.right + 8, y: r.top + r.height / 2 } : side === "left" ? { x: r.left - 8, y: r.top + r.height / 2 } : side === "top" ? { x: r.left + r.width / 2, y: r.top - 8 } : { x: r.left + r.width / 2, y: r.bottom + 8 };
      setTip({ text: el.dataset.tip!, kbd: el.dataset.tipKbd, side, ...pos });
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.("[data-tip]") as HTMLElement | null;
      if (el === current) return;
      current = el;
      clearTimeout(timer);
      setTip(null);
      if (el) timer = setTimeout(() => show(el), 450);
    };
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    window.addEventListener("pointerover", over);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  if (!tip) return null;
  const transform =
    tip.side === "right" ? "translate(0,-50%)" : tip.side === "left" ? "translate(-100%,-50%)" : tip.side === "top" ? "translate(-50%,-100%)" : "translate(-50%,0)";
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed flex items-center gap-2 rounded-md border border-border bg-raised px-2 py-1 text-xs text-text shadow-[var(--shadow)] anim-fade"
      style={{ left: tip.x, top: tip.y, transform, zIndex: 70 }}
    >
      {tip.text}
      {tip.kbd && <span className="kbd">{tip.kbd}</span>}
    </div>,
    document.body,
  );
}
