// The "Envol" bird, generated from brand/build-envol.mjs (keep in sync).
const FACETS: [string, string][] = [
  ["M142 150 L198 68 L174 142 Z", "#5A3BB5"],
  ["M108 164 L172 142 L92 56 Z", "#F76046"],
  ["M108 164 L92 56 L56 102 Z", "#C8432E"],
  ["M108 164 L172 142 L182 166 L128 196 Z", "#8E5BE8"],
  ["M172 142 L230 132 L182 166 Z", "#F5AE39"],
  ["M108 164 L128 196 L24 206 Z", "#567BF7"],
];

export function LogoMark({ size = 24, className, mono }: { size?: number; className?: string; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="16 40 224 176" className={className} aria-hidden>
      {FACETS.map(([d, c], i) => (
        <path key={i} d={d} fill={mono ? "currentColor" : c} fillOpacity={mono ? [0.45, 1, 0.62, 0.82, 1, 0.62][i] : 1} />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  // lowercase rounded "aven", stroke-built like the brand wordmark
  return (
    <svg viewBox="296 60 504 136" className={className} aria-label="Aven" role="img">
      <path
        d="M307 126 A39 39 0 1 0 385 126 A39 39 0 1 0 307 126 M385 87 V165 M431 87 L471 165 L511 87 M553 126 H631 A39 39 0 1 0 619.58 153.58 M675 87 V165 M675 165 V118 A39 39 0 0 1 753 118 V165"
        fill="none"
        stroke="currentColor"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Lockup({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.45em" }}>
      <LogoMark size={22} />
      <Wordmark className="h-[0.95em] w-auto text-text" />
    </span>
  );
}
