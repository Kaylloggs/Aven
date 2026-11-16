// Adds four small hooks to the Excalidraw 0.18.1 bundles so Aven can render rich text styles
// (bold, italic, underline, strikethrough) stored in `element.customData`:
//   1. the font string honours customData.avenBold / avenItalic (canvas, measuring, editor, SVG)
//   2. canvas text rendering calls globalThis.__avenDecorate after each line (underline/strike)
//   3. SVG export calls globalThis.__avenDecorateSvg for each <text> line
//   4. the engine's text re-measure function is exposed as globalThis.__avenRedrawText
// The script is idempotent and fails loudly if the engine version does not match.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules/@excalidraw/excalidraw");
const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
const MARK = "/*__aven_patched_v1__*/";

const PATCHES = {
  dev: [
    {
      name: "font string",
      from: "var getFontString = ({\n  fontSize,\n  fontFamily\n}) => {\n  return `${fontSize}px ${getFontFamilyString({ fontFamily })}`;\n};",
      to: "var getFontString = ({\n  fontSize,\n  fontFamily,\n  customData\n}) => {\n  return `${customData && customData.avenItalic ? \"italic \" : \"\"}${customData && customData.avenBold ? \"bold \" : \"\"}${fontSize}px ${getFontFamilyString({ fontFamily })}`;\n};",
    },
    {
      name: "canvas decorations",
      from: "          context.fillText(\n            lines[index],\n            horizontalOffset,\n            index * lineHeightPx + verticalOffset\n          );\n        }",
      to: "          context.fillText(\n            lines[index],\n            horizontalOffset,\n            index * lineHeightPx + verticalOffset\n          );\n          globalThis.__avenDecorate && globalThis.__avenDecorate(context, element, lines[index], horizontalOffset, index * lineHeightPx + verticalOffset);\n        }",
    },
    {
      name: "svg decorations",
      from: '          text.setAttribute("dominant-baseline", "alphabetic");\n          node.appendChild(text);',
      to: '          text.setAttribute("dominant-baseline", "alphabetic");\n          globalThis.__avenDecorateSvg && globalThis.__avenDecorateSvg(text, element);\n          node.appendChild(text);',
    },
    {
      name: "text re-measure",
      from: "var redrawTextBoundingBox = (textElement, container, elementsMap, informMutation = true) => {",
      to: "var redrawTextBoundingBox = globalThis.__avenRedrawText = (textElement, container, elementsMap, informMutation = true) => {",
    },
    {
      name: "font size parse",
      from: "  const fontSize = parseFloat(font);",
      to: "  const fontSize = parseFloat(String(font).replace(/^(?:italic |bold )+/, \"\"));",
    },
  ],
  prod: [
    {
      name: "font string",
      from: "Ee=({fontSize:e,fontFamily:t})=>`${e}px ${ea({fontFamily:t})}`",
      to: 'Ee=({fontSize:e,fontFamily:t,customData:__c})=>`${__c&&__c.avenItalic?"italic ":""}${__c&&__c.avenBold?"bold ":""}${e}px ${ea({fontFamily:t})}`',
    },
    {
      name: "canvas decorations",
      from: "for(let U=0;U<s.length;U++)n.fillText(s[U],d,U*c+l);n.restore()",
      to: "for(let U=0;U<s.length;U++){n.fillText(s[U],d,U*c+l);globalThis.__avenDecorate&&globalThis.__avenDecorate(n,e,s[U],d,U*c+l)}n.restore()",
    },
    {
      name: "svg decorations",
      from: '_.setAttribute("dominant-baseline","alphabetic"),y.appendChild(_)',
      to: '_.setAttribute("dominant-baseline","alphabetic"),globalThis.__avenDecorateSvg&&globalThis.__avenDecorateSvg(_,e),y.appendChild(_)',
    },
    {
      name: "text re-measure",
      from: "var Xa=(e,t,n,r=!0)=>{let o,i={x:e.x",
      to: "var Xa=globalThis.__avenRedrawText=(e,t,n,r=!0)=>{let o,i={x:e.x",
    },
    {
      name: "font size parse",
      from: "o=parseFloat(t),i=B6(r,o,n)",
      to: "o=parseFloat(String(t).replace(/^(?:italic |bold )+/,\"\")),i=B6(r,o,n)",
    },
  ],
};

if (version !== "0.18.1") {
  console.error(`patch-engine: expected @excalidraw/excalidraw 0.18.1, found ${version}. Update scripts/patch-engine.mjs.`);
  process.exit(1);
}

for (const [build, patches] of Object.entries(PATCHES)) {
  const dir = join(pkgDir, "dist", build);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  const contents = new Map(files.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
  const touched = new Set();
  for (const p of patches) {
    const done = [...contents.values()].some((s) => s.includes(p.to));
    if (done) continue;
    const hits = [...contents].filter(([, s]) => s.split(p.from).length === 2);
    if (hits.length !== 1) {
      console.error(`patch-engine: "${p.name}" (${build}) not found exactly once (found in ${hits.length} files).`);
      process.exit(1);
    }
    const [file, s] = hits[0];
    contents.set(file, s.replace(p.from, p.to));
    touched.add(file);
  }
  for (const f of touched) {
    let s = contents.get(f);
    if (!s.startsWith(MARK)) s = MARK + s;
    writeFileSync(join(dir, f), s);
  }
  console.log(`patch-engine: ${build} ${touched.size ? `patched ${[...touched].join(", ")}` : "already patched"}`);
}
