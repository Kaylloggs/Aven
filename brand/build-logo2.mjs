// Aven logo concepts, round 3 (no letter A, no overlapping primitives).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "concepts3");
mkdirSync(out, { recursive: true });

const C = {
  honey: "#F5AE39", coral: "#F76046", violet: "#8E5BE8", blue: "#567BF7",
  green: "#2FB27E", ink: "#191A24", paper: "#FBFAF8",
};

// Rounded square path centred on (cx,cy)
const sq = (cx, cy, s, r) => {
  const x = cx - s / 2, y = cy - s / 2;
  return `M${x + r} ${y} H${x + s - r} A${r} ${r} 0 0 1 ${x + s} ${y + r} V${y + s - r} A${r} ${r} 0 0 1 ${x + s - r} ${y + s} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + s - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
};
const f = (n) => +n.toFixed(2);

// 1. Aven (the shaft): nested squares receding to an off-centre vanishing point
const shaft = (() => {
  const cols = [C.honey, C.coral, C.violet, C.blue, C.ink];
  const vp = [178, 80];
  let s = 224, cx = 128, cy = 128, out = "";
  cols.forEach((col, i) => {
    out += `<path d="${sq(f(cx), f(cy), f(s), f(s * 0.24))}" fill="${col}"/>`;
    s *= 0.7;
    cx = cx + (vp[0] - cx) * 0.52;
    cy = cy + (vp[1] - cy) * 0.52;
  });
  return out;
})();

// 2. Pont-Aven cloisonne: flat colour cells divided by bold dark lines
const cloisonne = `
<defs><clipPath id="cl"><path d="${sq(128, 128, 224, 60)}"/></clipPath></defs>
<g clip-path="url(#cl)">
  <rect x="0" y="0" width="256" height="256" fill="${C.honey}"/>
  <circle cx="170" cy="86" r="38" fill="${C.coral}"/>
  <path d="M0 158 C60 112 112 112 156 140 C190 162 224 150 256 128 V256 H0 Z" fill="${C.blue}"/>
  <path d="M0 214 C54 184 110 178 160 196 C200 210 232 204 256 192 V256 H0 Z" fill="${C.green}"/>
  <g fill="none" stroke="${C.ink}" stroke-width="13" stroke-linecap="round">
    <circle cx="170" cy="86" r="38"/>
    <path d="M0 158 C60 112 112 112 156 140 C190 162 224 150 256 128"/>
    <path d="M0 214 C54 184 110 178 160 196 C200 210 232 204 256 192"/>
  </g>
</g>
<path d="${sq(128, 128, 218, 57)}" fill="none" stroke="${C.ink}" stroke-width="13"/>`;

// 3. Lifted canvas: a sheet with its corner peeled up, colour underneath, one drawn stroke
const lifted = `
<defs><linearGradient id="flap" x1="1" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${C.coral}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient></defs>
<path d="M54 24 H202 A30 30 0 0 1 232 54 V146 L146 232 H54 A30 30 0 0 1 24 202 V54 A30 30 0 0 1 54 24 Z" fill="${C.paper}"/>
<path d="M232 146 L146 232 L146 146 Z" fill="url(#flap)"/>
<path d="M60 128 C80 70 116 66 124 98 C132 128 150 122 172 62" fill="none" stroke="${C.honey}" stroke-width="20" stroke-linecap="round"/>
<circle cx="60" cy="128" r="16" fill="${C.blue}"/>`;

// 4. Aves (origami bird): idea taking flight, folded from coloured facets
const bird = `
<path d="M34 120 L92 98 L104 132 Z" fill="${C.honey}"/>
<path d="M92 98 L212 34 L148 128 Z" fill="${C.coral}"/>
<path d="M92 98 L148 128 L104 132 Z" fill="#C9472F"/>
<path d="M104 132 L148 128 L226 168 L132 184 Z" fill="${C.violet}"/>
<path d="M148 128 L226 168 L190 132 Z" fill="${C.blue}"/>
<path d="M132 184 L226 168 L168 212 Z" fill="#6A3FC4"/>`;

const concepts = { shaft, cloisonne, lifted, bird };
const tile = (mark, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>Aven</title>
<rect x="64" y="64" width="896" height="896" rx="208" fill="${bg}"/>
<g transform="translate(192 192) scale(2.5)">${mark}</g></svg>`;
const bare = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Aven</title>${mark}</svg>`;

for (const [name, mark] of Object.entries(concepts)) {
  writeFileSync(join(out, `${name}-symbol.svg`), bare(mark));
  writeFileSync(join(out, `${name}-icon.svg`), name === "shaft" || name === "cloisonne" ? bare(mark) : tile(mark, C.ink));
}
console.log("ok", out);
