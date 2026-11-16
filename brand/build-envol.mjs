// Aven final identity: "Envol" — an origami bird folded from colour facets.
// Run: node brand/build-envol.mjs  → writes brand/final/*.svg
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "final");
mkdirSync(out, { recursive: true });
for (const f of (await import("node:fs")).readdirSync(out, { withFileTypes: true }).filter((e) => e.isFile())) rmSync(join(out, f.name));


export const BRAND = {
  honey: "#F5AE39",
  coral: "#F76046",
  coralDeep: "#C8432E",
  violet: "#8E5BE8",
  violetDeep: "#5A3BB5",
  blue: "#567BF7",
  ink: "#191A24",
  paper: "#FBFAF8",
};

// Vertices (256 grid). Bird flies up-right.
const RAW = {
  beak: [238, 94],
  neckTop: [180, 104],
  neckLow: [190, 128],
  back: [116, 126],
  belly: [136, 158],
  wingTip: [100, 18],
  wingCrease: [64, 64],
  tail: [32, 168],
  farRoot: [150, 112],
  farTip: [206, 30],
  farBase: [182, 104],
};
// centre the silhouette optically in the 256 box
const DX = -8, DY = 38;
const V = Object.fromEntries(Object.entries(RAW).map(([k, [x, y]]) => [k, [x + DX, y + DY]]));
const tri = (...pts) => "M" + pts.map((k) => V[k].join(" ")).join(" L") + " Z";

const facets = (c) => [
  [tri("farRoot", "farTip", "farBase"), c.farWing],
  [tri("back", "neckTop", "wingTip"), c.wingFront],
  [tri("back", "wingTip", "wingCrease"), c.wingBack],
  [tri("back", "neckTop", "neckLow", "belly"), c.body],
  [tri("neckTop", "beak", "neckLow"), c.head],
  [tri("back", "belly", "tail"), c.tail],
];
const COLOUR = {
  head: BRAND.honey, wingFront: BRAND.coral, wingBack: BRAND.coralDeep,
  body: BRAND.violet, tail: BRAND.blue, farWing: BRAND.violetDeep,
};
// One-colour version: tints of a single colour keep the folds readable on any background
const TINT = { head: 1, wingFront: 1, wingBack: 0.62, body: 0.82, tail: 0.62, farWing: 0.45 };
const mono = (fill) => Object.fromEntries(Object.keys(COLOUR).map((k) => [k, `${fill}" fill-opacity="${TINT[k]}`]));

const bird = (c, gap = 0, gapColour = "none") =>
  facets(c).map(([d, fill]) => `<path d="${d}" fill="${fill}"${gap ? ` stroke="${gapColour}" stroke-width="${gap}" stroke-linejoin="round"` : ""}/>`).join("");

// Lowercase rounded wordmark "aven" (x-height 100, stroke 22, round caps)
const wordmark = (x0, colour) => {
  const w = 22, r = 39, top = 87, bot = 165, mid = 126;
  const a = x0 + 50, v = x0 + 135, e = x0 + 296, n = x0 + 379;
  const d = [
    `M${a - r} ${mid} A${r} ${r} 0 1 0 ${a + r} ${mid} A${r} ${r} 0 1 0 ${a - r} ${mid}`, // a bowl
    `M${a + r} ${top} V${bot}`, // a stem
    `M${v} ${top} L${v + 40} ${bot} L${v + 80} ${top}`, // v
    `M${e - r} ${mid} H${e + r} A${r} ${r} 0 1 0 ${(e + r * Math.SQRT1_2).toFixed(2)} ${(mid + r * Math.SQRT1_2).toFixed(2)}`, // e
    `M${n} ${top} V${bot} M${n} ${bot} V${mid - 8} A${r} ${r} 0 0 1 ${n + 2 * r} ${mid - 8} V${bot}`, // n
  ].join(" ");
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><title>Aven</title>${body}</svg>\n`;
const tile = (bg) => `<rect x="64" y="64" width="896" height="896" rx="208" fill="${bg}"/>`;
const files = {
  "aven-symbol.svg": svg("0 0 256 256", bird(COLOUR)),
  "aven-symbol-black.svg": svg("0 0 256 256", bird(mono("#000000"))),
  "aven-symbol-white.svg": svg("0 0 256 256", bird(mono("#FFFFFF"))),
  "aven-app-icon.svg": svg("0 0 1024 1024", tile(BRAND.ink) + `<g transform="translate(144 132) scale(2.9)">${bird(COLOUR)}</g>`),
  "aven-app-icon-light.svg": svg("0 0 1024 1024", tile(BRAND.paper) + `<g transform="translate(144 132) scale(2.9)">${bird(COLOUR)}</g>`),
  "aven-horizontal-dark.svg": svg("0 0 800 256", bird(COLOUR) + wordmark(296, BRAND.paper)),
  "aven-horizontal-light.svg": svg("0 0 800 256", bird(COLOUR) + wordmark(296, BRAND.ink)),
  "aven-horizontal-black.svg": svg("0 0 800 256", bird(mono("#000000")) + wordmark(296, "#000000")),
  "aven-horizontal-white.svg": svg("0 0 800 256", bird(mono("#FFFFFF")) + wordmark(296, "#FFFFFF")),
  "aven-wordmark-dark.svg": svg("296 60 504 136", wordmark(296, BRAND.paper)),
  "aven-wordmark-light.svg": svg("296 60 504 136", wordmark(296, BRAND.ink)),
};
for (const [name, body] of Object.entries(files)) writeFileSync(join(out, name), body);
console.log(`wrote ${Object.keys(files).length} files to ${out}`);
