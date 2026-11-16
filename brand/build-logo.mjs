// Generates Aven logo concept SVGs. Run: node brand/build-logo.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "concepts2");
mkdirSync(out, { recursive: true });

const C = {
  honey: "#F5AE39",
  coral: "#F76046",
  blue: "#567BF7",
  ink: "#191A24",
  canvas: "#FBFAF8",
  dot: "#DFDEDA",
};
// Overlaps mix like paint: yellow+red=orange, red+blue=violet, yellow+blue=green
const MIX = {
  [["#F5AE39", "#F76046"].join()]: "#F0812F",
  [["#F76046", "#567BF7"].join()]: "#8E5BE8",
  [["#F5AE39", "#567BF7"].join()]: "#2FB27E",
};
const mix = (a, b) => MIX[[a, b].join()] ?? MIX[[b, a].join()];
const mul = (a, b) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round((v * y[i]) / 255).toString(16).padStart(2, "0")).join("");
};

// stadium (thick line with round caps) as a filled path
const stadium = (x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  const f = (n) => n.toFixed(2);
  return `M${f(x1 + nx)} ${f(y1 + ny)} L${f(x2 + nx)} ${f(y2 + ny)} A${w / 2} ${w / 2} 0 0 0 ${f(x2 - nx)} ${f(y2 - ny)} L${f(x1 - nx)} ${f(y1 - ny)} A${w / 2} ${w / 2} 0 0 0 ${f(x1 + nx)} ${f(y1 + ny)} Z`;
};

const dotGrid = (x0, y0, size, step, r, color) => {
  let s = "";
  for (let y = y0 + step / 2; y < y0 + size; y += step)
    for (let x = x0 + step / 2; x < x0 + size; x += step) s += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
  return `<g fill="${color}">${s}</g>`;
};

// ---------- Concept A: Primitives (shape + line + point overlap into an A)
const T = "M30 222 L112 40 L146 222 Z";
const L = stadium(118, 48, 208, 214, 40);
const P = { cx: 150, cy: 176, r: 28 };
const circle = (fill) => `<circle cx="${P.cx}" cy="${P.cy}" r="${P.r}" fill="${fill}"/>`;
const primitivesMark = `
<defs>
  <clipPath id="cT"><path d="${T}"/></clipPath>
  <clipPath id="cL"><path d="${L}"/></clipPath>
</defs>
<path d="${T}" fill="${C.honey}"/>
<path d="${L}" fill="${C.coral}"/>
${circle(C.blue)}
<path d="${L}" fill="${mix(C.honey, C.coral)}" clip-path="url(#cT)"/>
<g clip-path="url(#cT)">${circle(mix(C.honey, C.blue))}</g>
<g clip-path="url(#cL)">${circle(mix(C.coral, C.blue))}</g>`;

// ---------- Concept B: Ink loop (one continuous stroke draws the A, the crossbar loops)
const loopPath = "M46 222 L124 44 Q128 36 132 44 L196 196 C206 222 172 232 150 214 C126 194 132 160 170 160 C190 160 206 170 214 180";
const inkMark = `
<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="${C.blue}"/><stop offset="0.55" stop-color="${C.coral}"/><stop offset="1" stop-color="${C.honey}"/>
</linearGradient></defs>
<path d="${loopPath}" fill="none" stroke="url(#g)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`;

// ---------- Concept C: Prism (three translucent bars stack into an A)
const prismMark = (() => {
  const left = stadium(60, 214, 122, 52, 46);
  const right = stadium(134, 52, 196, 214, 46);
  const bar = stadium(70, 160, 186, 160, 34);
  return `
<defs>
  <clipPath id="pL"><path d="${left}"/></clipPath>
  <clipPath id="pR"><path d="${right}"/></clipPath>
</defs>
<path d="${left}" fill="${C.honey}"/>
<path d="${right}" fill="${C.coral}"/>
<path d="${bar}" fill="${C.blue}"/>
<path d="${right}" fill="${mix(C.honey, C.coral)}" clip-path="url(#pL)"/>
<path d="${bar}" fill="${mix(C.honey, C.blue)}" clip-path="url(#pL)"/>
<path d="${bar}" fill="${mix(C.coral, C.blue)}" clip-path="url(#pR)"/>`;
})();

const symbol = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Aven</title>${mark}</svg>`;
const icon = (mark, tile) => {
  const bg = tile === "light" ? C.canvas : C.ink;
  const dots = tile === "light" ? dotGrid(64, 64, 896, 64, 5, C.dot) : dotGrid(64, 64, 896, 64, 5, "#2A2B38");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>Aven</title>
<defs><clipPath id="tile"><rect x="64" y="64" width="896" height="896" rx="208"/></clipPath></defs>
<rect x="64" y="64" width="896" height="896" rx="208" fill="${bg}"/>
<g clip-path="url(#tile)">${dots}</g>
<g transform="translate(${tile === "light" ? 200 : 200} 166) scale(2.5)">${mark}</g></svg>`;
};

const concepts = { primitives: primitivesMark, ink: inkMark, prism: prismMark };
for (const [name, mark] of Object.entries(concepts)) {
  writeFileSync(join(out, `${name}-symbol.svg`), symbol(mark));
  writeFileSync(join(out, `${name}-icon-light.svg`), icon(mark, "light"));
  writeFileSync(join(out, `${name}-icon-dark.svg`), icon(mark, "dark"));
}
console.log("wrote", Object.keys(concepts).length * 3, "files to", out);
