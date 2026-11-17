// Small origami-style illustrations built from the logo's facet colours.
// Decorative only: always aria-hidden.
const C = {
  honey: "#F5AE39",
  coral: "#F76046",
  coralDeep: "#C8432E",
  violet: "#8E5BE8",
  violetDeep: "#5A3BB5",
  blue: "#567BF7",
  green: "#2FB27E",
  paper: "#FBFAF8",
  paperShade: "#E7E5EE",
};

export function FacetArt({ kind, className }: { kind: "blank" | "template" | "project" | "empty" | "import" | "board" | "note"; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden>
      {kind === "blank" && (
        <>
          <path d="M22 14 H82 L98 30 V78 H22 Z" fill={C.paper} />
          <path d="M82 14 L98 30 H82 Z" fill={C.paperShade} />
          <path d="M36 62 C46 40 58 40 62 52 C66 64 76 58 84 40" fill="none" stroke={C.coral} strokeWidth="4" strokeLinecap="round" />
          <path d="M84 40 L98 22 L102 34 Z" fill={C.honey} />
          <circle cx="36" cy="62" r="4.5" fill={C.blue} />
        </>
      )}
      {kind === "template" && (
        <>
          <path d="M34 22 H92 V74 H34 Z" fill={C.violetDeep} opacity="0.55" transform="rotate(-6 63 48)" />
          <path d="M28 18 H86 V72 H28 Z" fill={C.paper} />
          <path d="M34 26 H58 V40 H34 Z" fill={C.blue} />
          <path d="M62 26 H80 V40 H62 Z" fill={C.honey} />
          <path d="M34 46 H80 V64 H34 Z" fill={C.green} opacity="0.85" />
          <path d="M86 18 L100 10 L96 30 Z" fill={C.coral} />
        </>
      )}
      {kind === "project" && (
        <>
          <path d="M18 30 H50 L56 22 H100 V76 H18 Z" fill={C.violet} />
          <path d="M18 38 H100 V76 H18 Z" fill={C.violetDeep} />
          <path d="M30 30 H88 V58 H30 Z" fill={C.paper} transform="rotate(-4 59 44)" />
          <path d="M18 44 L100 40 V76 H18 Z" fill={C.violet} />
          <path d="M70 52 L92 46 L84 66 Z" fill={C.honey} />
        </>
      )}
      {kind === "board" && (
        <>
          <rect x="14" y="16" width="28" height="60" rx="4" fill={C.paperShade} opacity="0.35" />
          <rect x="46" y="16" width="28" height="60" rx="4" fill={C.paperShade} opacity="0.35" />
          <rect x="78" y="16" width="28" height="60" rx="4" fill={C.paperShade} opacity="0.35" />
          <rect x="17" y="21" width="22" height="14" rx="3" fill={C.coral} />
          <rect x="17" y="39" width="22" height="14" rx="3" fill={C.paper} />
          <rect x="49" y="21" width="22" height="14" rx="3" fill={C.honey} />
          <rect x="81" y="21" width="22" height="14" rx="3" fill={C.green} />
          <rect x="81" y="39" width="22" height="14" rx="3" fill={C.blue} />
          <rect x="81" y="57" width="22" height="14" rx="3" fill={C.violet} />
        </>
      )}
      {kind === "note" && (
        <>
          <path d="M28 12 H80 L94 26 V80 H28 Z" fill={C.paper} />
          <path d="M80 12 L94 26 H80 Z" fill={C.paperShade} />
          <rect x="38" y="28" width="30" height="6" rx="3" fill={C.violet} />
          <rect x="38" y="42" width="44" height="4" rx="2" fill={C.paperShade} />
          <rect x="38" y="51" width="40" height="4" rx="2" fill={C.paperShade} />
          <rect x="38" y="62" width="7" height="7" rx="2" fill={C.green} />
          <rect x="49" y="63.5" width="28" height="4" rx="2" fill={C.paperShade} />
        </>
      )}
      {kind === "import" && (
        <>
          <path d="M30 20 H78 L90 32 V76 H30 Z" fill={C.paper} />
          <path d="M78 20 L90 32 H78 Z" fill={C.paperShade} />
          <path d="M60 34 V62 M48 50 L60 62 L72 50" fill="none" stroke={C.blue} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "empty" && (
        <>
          <path d="M42 46 L60 36 L58 52 Z" fill={C.honey} />
          <path d="M60 36 L96 16 L72 54 Z" fill={C.coral} />
          <path d="M60 36 L72 54 L58 52 Z" fill={C.violet} />
          <path d="M58 52 L72 54 L52 74 Z" fill={C.violetDeep} />
          <path d="M42 46 L58 52 L18 60 Z" fill={C.blue} />
        </>
      )}
    </svg>
  );
}
