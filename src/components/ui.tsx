import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cx, shortcutLabel } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover font-[600] shadow-[var(--shadow-sm)]",
  secondary: "bg-surface-2 text-text border border-border hover:bg-hover hover:border-border-strong",
  ghost: "text-muted hover:text-text hover:bg-hover",
  subtle: "bg-hover/60 text-text hover:bg-active",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md whitespace-nowrap transition-colors duration-150 cursor-pointer select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-8 px-3 text-sm",
        size === "lg" && "h-10 px-4 text-md",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  tipSide?: "top" | "bottom" | "right" | "left";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, size = "md", tipSide = "bottom", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      data-tip={label}
      data-tip-kbd={shortcut ? shortcutLabel(shortcut) : undefined}
      data-tip-side={tipSide}
      className={cx(
        "inline-flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer shrink-0",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        size === "sm" && "size-7",
        size === "md" && "size-8",
        size === "lg" && "size-10",
        active ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text hover:bg-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input(
  { className, icon, ...rest },
  ref,
) {
  return (
    <div className={cx("relative flex items-center", className)}>
      {icon && <span className="pointer-events-none absolute left-2.5 text-faint">{icon}</span>}
      <input
        ref={ref}
        className={cx(
          "h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-sm text-text placeholder:text-faint",
          "transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
          icon && "pl-8",
        )}
        {...rest}
      />
    </div>
  );
});

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "min-h-20 w-full rounded-md border border-border bg-surface-2 px-2.5 py-2 text-sm text-text placeholder:text-faint",
        "hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
        props.className,
      )}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-8 rounded-md border border-border bg-surface-2 pl-2.5 pr-7 text-sm text-text cursor-pointer appearance-none",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23888' stroke-width='1.6' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E\")] bg-no-repeat bg-[right_8px_center]",
        "hover:border-border-strong focus:border-accent focus:outline-none",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50",
        checked ? "bg-accent" : "bg-active",
      )}
    >
      <span
        className={cx(
          "inline-block size-4 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-surface-2 border border-border p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={typeof o.label === "string" ? undefined : o.title}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[5px] px-2.5 transition-colors duration-150 cursor-pointer inline-flex items-center gap-1.5",
            size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
            value === o.value ? "bg-raised text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string; inline?: boolean }) {
  if (inline)
    return (
      <div className="flex items-center justify-between gap-6 py-3">
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="block text-sm font-[550] text-text">
            {label}
          </label>
          {hint && <p className="mt-0.5 text-xs text-muted max-w-[60ch]">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-[550] text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Kbd({ k }: { k: string }) {
  return <kbd className="kbd">{shortcutLabel(k)}</kbd>;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 anim-fade">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface-2 border border-border text-muted">{icon}</div>
      <h3 className="text-md text-text">{title}</h3>
      {body && <p className="mt-1.5 max-w-[46ch] text-sm text-muted">{body}</p>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-sm font-[650] text-text">{children}</h2>
      {action}
    </div>
  );
}

export const PROJECT_COLORS: Record<string, string> = {
  honey: "#F5AE39",
  coral: "#F76046",
  violet: "#8E5BE8",
  blue: "#567BF7",
  green: "#2FB27E",
  graphite: "#8A8B99",
};
