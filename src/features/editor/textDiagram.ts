// Turn an indented list into a diagram (mind map, org chart, plan or flow), built from the
// same Board builder as the templates so the result is fully editable.
import { Board } from "@/features/templates/dsl";

export type OutlineLayout = "mindmap" | "orgchart" | "plan" | "flow";

export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

/** Parse "- item" / "* item" / "1. item" / plain lines, nesting by indentation. */
export function parseOutline(src: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];
  for (const raw of src.replace(/\t/g, "    ").split(/\r?\n/)) {
    if (!raw.trim() || /^\s*(#|\/\/)/.test(raw) && !/^\s*#\s/.test(raw)) continue;
    const indent = raw.match(/^\s*/)![0].length;
    let text = raw.trim().replace(/^([-*+•]|\d+[.)]|#+)\s+/, "").trim();
    if (!text) continue;
    if (text.length > 80) text = `${text.slice(0, 79)}…`;
    const node: OutlineNode = { text, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ indent, node });
  }
  return roots;
}

const FILLS = ["yellow", "blue", "violet", "green", "orange", "pink", "cyan", "red"];

function boxSize(text: string, level: number) {
  const size = level === 0 ? 22 : level === 1 ? 18 : 15;
  const w = Math.min(300, Math.max(level === 0 ? 180 : 130, text.length * size * 0.55 + 36));
  const lines = Math.ceil((text.length * size * 0.55) / (w - 24));
  return { w, h: Math.max(level === 0 ? 72 : 50, lines * size * 1.3 + 22), size };
}

function leaves(n: OutlineNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1;
}

/** Build the diagram as editable skeleton elements. */
export function outlineToBoard(nodes: OutlineNode[], layout: OutlineLayout, handDrawn = false): Board {
  const b = new Board(handDrawn ? { roughness: 1, font: 5 } : { roughness: 0, font: 6 });
  if (!nodes.length) return b;
  // several top-level items under a mind map / org chart get an implicit root
  const root: OutlineNode = nodes.length === 1 ? nodes[0] : { text: layout === "flow" ? "" : "Topic", children: nodes };

  if (layout === "flow") {
    const steps = nodes.length === 1 && nodes[0].children.length ? [nodes[0], ...nodes[0].children.map((c) => ({ ...c, children: c.children }))] : nodes;
    let prev: string | null = null;
    let y = 0;
    steps.forEach((s, i) => {
      const isQ = s.text.trim().endsWith("?");
      const first = i === 0;
      const last = i === steps.length - 1 && !s.children.length;
      const { w, h } = boxSize(s.text, 1);
      const id = isQ
        ? b.diamond(-w / 2 - 20, y, w + 40, h + 40, { fill: "yellow", label: s.text })
        : first || last
          ? b.ellipse(-w / 2, y, w, h, { fill: first ? "green" : "red", label: s.text })
          : b.rect(-w / 2, y, w, h, { fill: "blue", label: s.text });
      if (prev) b.arrow(prev, id);
      // children are side branches (e.g. answers of a question)
      s.children.forEach((c, j) => {
        const cs = boxSize(c.text, 2);
        const cid = b.rect(w / 2 + 80 + j * (cs.w + 30), y + (isQ ? 20 : 0), cs.w, cs.h, { fill: "violet", label: c.text });
        b.arrow(id, cid, { label: j === 0 && isQ ? "yes" : j === 1 && isQ ? "no" : undefined });
      });
      prev = id;
      y += h + (isQ ? 40 : 0) + 70;
    });
    return b;
  }

  if (layout === "orgchart") {
    const colW = 190;
    const rowH = 130;
    const place = (n: OutlineNode, level: number, x0: number, parent: string | null, fillIdx: number) => {
      const width = leaves(n) * colW;
      const { w, h, size } = boxSize(n.text, level);
      const id = b.rect(x0 + width / 2 - w / 2, level * rowH, w, h, { fill: level === 0 ? "yellow" : FILLS[(fillIdx % (FILLS.length - 1)) + 1], label: n.text, size });
      if (parent) b.arrow(parent, id);
      let x = x0;
      n.children.forEach((c, i) => {
        place(c, level + 1, x, id, level === 0 ? i : fillIdx);
        x += leaves(c) * colW;
      });
    };
    place(root, 0, 0, null, 0);
    return b;
  }

  if (layout === "plan") {
    const colW = 280;
    const rowH = 70;
    let row = 0;
    // children are placed first so each parent can sit centred on its branch; returns the box id
    const place = (n: OutlineNode, level: number, fillIdx: number): string => {
      const startRow = row;
      const childIds = n.children.map((c, i) => place(c, level + 1, level === 0 ? i : fillIdx));
      if (!n.children.length) row++;
      const centerRow = (startRow + row - 1) / 2;
      const { w, h, size } = boxSize(n.text, level);
      const id = b.rect(level * colW, centerRow * rowH - h / 2 + 25, Math.min(w, colW - 50), h, {
        fill: level === 0 ? "yellow" : FILLS[(fillIdx % (FILLS.length - 1)) + 1],
        label: n.text,
        size,
        align: level === 0 ? "center" : "left",
      });
      for (const c of childIds) b.arrow(id, c);
      return id;
    };
    place(root, 0, 0);
    return b;
  }

  // mind map: root in the middle, branches split left and right
  const { w: rw, h: rh, size: rs } = boxSize(root.text, 0);
  const rootId = b.ellipse(-rw / 2 - 20, -rh / 2 - 10, rw + 40, rh + 20, { fill: "yellow", label: root.text, size: rs });
  const sides: [OutlineNode[], OutlineNode[]] = [[], []];
  let lw = 0;
  let rwSum = 0;
  for (const c of root.children) {
    if (rwSum <= lw) {
      sides[1].push(c);
      rwSum += leaves(c);
    } else {
      sides[0].push(c);
      lw += leaves(c);
    }
  }
  const rowH = 64;
  sides.forEach((list, sideIdx) => {
    const dir = sideIdx === 1 ? 1 : -1;
    const total = list.reduce((s, c) => s + leaves(c), 0);
    let row = -total / 2;
    const place = (n: OutlineNode, level: number, parent: string, fill: string) => {
      const span = leaves(n);
      const cy = (row + span / 2) * rowH;
      const { w, h, size } = boxSize(n.text, Math.min(level, 2));
      const x = dir * (rw / 2 + 80 + (level - 1) * 230);
      const id = b.rect(dir > 0 ? x : x - w, cy - h / 2, w, h, { fill: level === 1 ? fill : "white", label: n.text, size });
      b.arrow(parent, id);
      if (n.children.length) n.children.forEach((c) => place(c, level + 1, id, fill));
      else row += 1;
    };
    list.forEach((c, i) => place(c, 1, rootId, FILLS[((i + sideIdx * 3) % (FILLS.length - 1)) + 1]));
  });
  return b;
}

export function looksLikeMermaid(src: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/m.test(src);
}
