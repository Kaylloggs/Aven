import { describe, expect, it } from "vitest";
import {
  addCard,
  addColumn,
  addLabel,
  colorName,
  COLUMN_COLORS,
  LABEL_COLORS,
  boardText,
  boardToMarkdown,
  checklistProgress,
  createBoard,
  deleteCard,
  deleteColumn,
  dueStatus,
  moveCard,
  moveColumn,
  parseBoard,
  removeLabel,
  serializeBoard,
  updateCard,
  updateLabel,
} from "@/engine/board";
import { buildParts, chartBox, chartIdsIn, chartRef, createChart, defaultChartData, parseRows, parseTable, rebuildChart } from "@/engine/charts";
import { decorationRects, styleTargets, toggleTextStyle, hasStyle } from "@/engine/textStyle";
import { continueLine, outlineToBoard, parseOutline, looksLikeMermaid, shiftLines } from "./editor/textDiagram";
import { blockOf, wordCount } from "./notes/noteCommands";
import { tableCellAt, tableLayout } from "@/engine/charts";
import { backgroundFor, canvasTone, hasDots, makeStyle } from "@/engine/canvasStyle";
import { isEmbeddableUrl, normaliseUrl } from "./editor/urls";
import { separateDuplicates } from "@/engine/generated";
import { createGauge, gaugeData, setGaugeValue } from "@/engine/gauge";
import { noteKey, resolveLink, wikilinkTargets } from "./notes/links";

describe("kanban boards", () => {
  it("creates presets with columns and sample cards", () => {
    const b = createBoard("Launch", "kanban");
    expect(b.columns.map((c) => c.title)).toEqual(["To do", "In progress", "Done"]);
    expect(Object.keys(b.cards)).toHaveLength(3);
    expect(createBoard("Sprint", "sprint").columns).toHaveLength(5);
    expect(Object.keys(createBoard("x", "blank").cards)).toHaveLength(0);
  });

  it("adds, moves, updates and deletes cards", () => {
    let b = createBoard("B", "blank");
    b = addColumn(b, "Done");
    const [todo, done] = b.columns;
    b = addCard(b, todo.id, "First");
    b = addCard(b, todo.id, "Second");
    const [first, second] = b.columns[0].cardIds;
    b = moveCard(b, second, todo.id, 0);
    expect(b.columns[0].cardIds).toEqual([second, first]);
    b = moveCard(b, first, done.id);
    expect(b.columns[1].cardIds).toEqual([first]);
    b = updateCard(b, first, { due: "2026-01-01", checklist: [{ id: "a", text: "x", done: true }, { id: "b", text: "y", done: false }] });
    expect(checklistProgress(b.cards[first])).toEqual({ done: 1, total: 2 });
    b = deleteCard(b, first);
    expect(b.cards[first]).toBeUndefined();
    expect(b.columns[1].cardIds).toEqual([]);
  });

  it("reorders and deletes columns, keeping or dropping their cards", () => {
    let b = createBoard("B", "kanban");
    const [a, , c] = b.columns;
    b = moveColumn(b, c.id, 0);
    expect(b.columns[0].id).toBe(c.id);
    const moved = deleteColumn(b, a.id, c.id);
    expect(moved.columns.find((x) => x.id === c.id)!.cardIds).toHaveLength(2);
    expect(Object.keys(moved.cards)).toHaveLength(3);
    const dropped = deleteColumn(b, a.id, null);
    expect(Object.keys(dropped.cards)).toHaveLength(1);
  });

  it("names every board colour and edits labels", () => {
    for (const c of [...COLUMN_COLORS, ...LABEL_COLORS]) expect(colorName(c)).not.toMatch(/^#/);
    expect(colorName("#f76046")).toBe("Coral");
    let b = createBoard("B", "kanban");
    const l = b.labels[0];
    b = updateLabel(b, l.id, { name: "Blocked", color: "#22B8CF" });
    expect(b.labels[0]).toEqual({ id: l.id, name: "Blocked", color: "#22B8CF" });
  });

  it("manages labels", () => {
    let b = createBoard("B", "kanban");
    const id = b.columns[0].cardIds[0];
    const r = addLabel(b, "Client");
    b = updateCard(r.board, id, { labels: [r.label.id] });
    b = removeLabel(b, r.label.id);
    expect(b.cards[id].labels).toEqual([]);
  });

  it("round-trips through the file format and repairs broken files", () => {
    const b = createBoard("Round trip", "kanban");
    const back = parseBoard(serializeBoard(b));
    expect(back.title).toBe("Round trip");
    expect(back.columns[0].cardIds).toEqual(b.columns[0].cardIds);
    const broken = JSON.parse(serializeBoard(b));
    broken.columns[0].cardIds = [];
    broken.columns[1].cardIds.push(broken.columns[1].cardIds[0]); // duplicate reference
    const fixed = parseBoard(JSON.stringify(broken));
    const all = fixed.columns.flatMap((c) => c.cardIds);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(3); // orphans recovered, duplicates removed
    expect(() => parseBoard(JSON.stringify({ type: "aven-board", version: 99 }))).toThrow(/newer version/);
    expect(() => parseBoard("{}")).toThrow();
  });

  it("computes due status", () => {
    const today = new Date(2026, 4, 10);
    expect(dueStatus("2026-05-09", today)).toBe("overdue");
    expect(dueStatus("2026-05-10", today)).toBe("today");
    expect(dueStatus("2026-05-12", today)).toBe("soon");
    expect(dueStatus("2026-06-01", today)).toBe("later");
    expect(dueStatus(null, today)).toBe("none");
  });

  it("exports Markdown and Obsidian Kanban format, and indexes text", () => {
    let b = createBoard("Plan", "kanban");
    const id = b.columns[0].cardIds[0];
    b = updateCard(b, id, { due: "2026-03-01", labels: [b.labels[0].id], description: "Details", checklist: [{ id: "x", text: "Sub task", done: true }] });
    const md = boardToMarkdown(b);
    expect(md).toContain("# Plan");
    expect(md).toContain("## To do");
    expect(md).toContain("(due 2026-03-01)");
    expect(md).toContain("#Urgent");
    expect(md).toContain("\t- [x] Sub task");
    const kb = boardToMarkdown(b, { obsidianKanban: true });
    expect(kb.startsWith("---\n\nkanban-plugin: basic")).toBe(true);
    expect(kb).toContain("@{2026-03-01}");
    expect(kb).toContain("%% kanban:settings");
    expect(boardText(b)).toContain("Sub task");
  });
});

describe("charts and tables", () => {
  it("creates a chart whose data lives on its box", () => {
    const els = createChart(0, 0, "bar");
    const box = els[0];
    expect(chartRef(box)!.role).toBe("box");
    expect(chartRef(box)!.data!.rows).toHaveLength(4);
    expect(els.every((e) => chartRef(e)?.chartId === chartRef(box)!.chartId)).toBe(true);
    expect(new Set(els.map((e) => e.groupIds.join())).size).toBe(1);
    expect(chartIdsIn(els, [els[3].id])).toEqual([chartRef(box)!.chartId]);
  });

  it("rebuilds from new data and from a resized box", () => {
    const els = createChart(0, 0, "bar");
    const id = chartRef(els[0])!.chartId;
    const data = { ...chartRef(els[0])!.data!, rows: [{ label: "A", value: 1 }, { label: "B", value: 2 }] };
    const next = rebuildChart(els, id, data);
    const texts = next.filter((e) => e.type === "text").map((e: any) => e.text);
    expect(texts).toContain("A");
    expect(texts).not.toContain("Q1");
    const wide = next.map((e) => (e.id === els[0].id ? { ...e, width: 1000 } : e));
    const relaid = rebuildChart(wide, id);
    const box = chartBox(relaid, id)!;
    expect(box.width).toBe(1000);
    const maxRight = Math.max(...relaid.filter((e) => e.id !== box.id).map((e) => e.x + e.width));
    expect(maxRight).toBeGreaterThan(600);
  });

  it("draws every chart kind, including closed pie slices", () => {
    for (const kind of ["bar", "hbar", "line", "pie", "donut", "table"] as const) {
      const parts = buildParts({ x: 0, y: 0, width: 480, height: 300 }, defaultChartData(kind));
      expect(parts.length, kind).toBeGreaterThan(3);
      for (const p of parts as any[]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.width), kind).toBe(true);
      }
    }
    const pie = buildParts({ x: 0, y: 0, width: 480, height: 300 }, defaultChartData("pie")) as any[];
    const slice = pie.find((p) => p.type === "line" && p.backgroundColor !== "transparent");
    expect(slice.points[0]).toEqual(slice.points.at(-1));
  });

  it("parses rows and pasted tables", () => {
    expect(parseRows("Apples, 3\nPears; 4,5\nPlums: 7%\nNo value")).toEqual([
      { label: "Apples", value: 3 },
      { label: "Pears", value: 4.5 },
      { label: "Plums", value: 7 },
      { label: "No value", value: 0 },
    ]);
    expect(parseTable("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable("| a | b |\n|---|---|\n| 1 | 2 |")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("text styles", () => {
  const text = (id: string, extra: any = {}) => ({ id, type: "text", isDeleted: false, x: 0, y: 0, width: 50, height: 20, text: "Hi", originalText: "Hi", fontSize: 20, textAlign: "left", version: 1, groupIds: [], ...extra }) as any;

  it("targets selected texts and labels of selected shapes", () => {
    const scene = [text("t1"), text("label", { containerId: "box" }), { id: "box", type: "rectangle", isDeleted: false, groupIds: [] } as any, text("other")];
    expect(styleTargets(scene, ["t1", "box"]).map((e) => e.id)).toEqual(["t1", "label"]);
  });

  it("toggles on for all, then off for all", () => {
    const scene = [text("a"), text("b", { customData: { avenBold: true } })];
    const on = toggleTextStyle(scene, ["a", "b"], "bold")!;
    expect(on.every((e) => hasStyle(e, "bold"))).toBe(true);
    const off = toggleTextStyle(on, ["a", "b"], "bold")!;
    expect(off.some((e) => hasStyle(e, "bold"))).toBe(false);
    expect(toggleTextStyle(scene, [], "bold")).toBeNull();
  });

  it("places underline and strikethrough for each alignment", () => {
    const el = { fontSize: 20, textAlign: "center", customData: { avenUnderline: true, avenStrike: true } };
    const [u, s] = decorationRects(el, 100, 200, 50);
    expect(u.x).toBe(150);
    expect(u.y).toBeGreaterThan(50);
    expect(s.y).toBeLessThan(50);
    expect(decorationRects({ ...el, textAlign: "right" }, 100, 200, 50)[0].x).toBe(100);
    expect(decorationRects({ fontSize: 20, textAlign: "left", customData: {} }, 100, 0, 0)).toEqual([]);
  });
});

describe("diagrams from text", () => {
  it("parses indented lists with any bullet style", () => {
    const t = parseOutline("Root\n  - A\n    * A1\n  2. B\n  C");
    expect(t).toHaveLength(1);
    expect(t[0].children.map((c) => c.text)).toEqual(["A", "B", "C"]);
    expect(t[0].children[0].children[0].text).toBe("A1");
    // a tab counts as one indentation level
    const tabs = parseOutline("Root\n\tChild\n\t\tGrandchild");
    expect(tabs[0].children[0].children[0].text).toBe("Grandchild");
  });

  it("builds every layout with connected arrows", () => {
    const nodes = parseOutline("Plan\n  Research\n    Interviews\n  Design\n  Build");
    for (const layout of ["mindmap", "orgchart", "plan", "flow"] as const) {
      const b = outlineToBoard(nodes, layout);
      const ids = new Set(b.els.map((e: any) => e.id));
      const arrows = b.els.filter((e: any) => e.type === "arrow") as any[];
      expect(arrows.length, layout).toBeGreaterThan(0);
      for (const a of arrows) {
        if (a.start?.id) expect(ids.has(a.start.id)).toBe(true);
        if (a.end?.id) expect(ids.has(a.end.id)).toBe(true);
      }
    }
  });

  it("detects Mermaid code", () => {
    expect(looksLikeMermaid("flowchart LR\n A-->B")).toBe(true);
    expect(looksLikeMermaid("sequenceDiagram\n A->>B: hi")).toBe(true);
    expect(looksLikeMermaid("Plan\n  Step")).toBe(false);
  });
});

describe("duplicated gauges and charts", () => {
  const copyOf = (els: any[], dx: number) => els.map((e) => ({ ...e, id: `${e.id}-copy`, x: e.x + dx, groupIds: ["copy-group"] }));
  const role = (els: any[], r: string) => els.find((e) => gaugeData(e)?.role === r);

  it("gives a duplicated gauge its own id and puts each part back on its own track", () => {
    const original = createGauge(0, 0, { value: 40 }) as any[];
    const copy = copyOf(original, 500);
    // what used to happen: editing the copy laid out both gauges as one
    const merged = setGaugeValue([...original, ...copy], [gaugeData(original[0])!.gaugeId], 70);
    const fixed = separateDuplicates(merged)!;
    expect(new Set(fixed.map((e) => gaugeData(e)?.gaugeId)).size).toBe(2);
    const copyEls = fixed.filter((e) => e.id.endsWith("-copy"));
    expect(role(copyEls, "fill").x).toBe(role(copyEls, "track").x);
    expect(role(fixed.filter((e) => !e.id.endsWith("-copy")), "fill").x).toBe(0);
    expect(separateDuplicates(fixed)).toBeNull();
  });

  it("gives a duplicated chart its own id, each with its box and parts", () => {
    const original = createChart(0, 0, "bar") as any[];
    const fixed = separateDuplicates([...original, ...copyOf(original, 600)])!;
    const ids = [...new Set(fixed.map((e) => chartRef(e)?.chartId))];
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(chartBox(fixed, id!)).toBeTruthy();
      expect(fixed.filter((e) => chartRef(e)?.chartId === id && chartRef(e)?.role === "part").length).toBeGreaterThan(3);
    }
  });

  it("leaves scenes without copies untouched", () => {
    expect(separateDuplicates([...createGauge(0, 0), ...createChart(0, 100, "pie")])).toBeNull();
  });
});

describe("note links", () => {
  it("reads [[links]] the way Obsidian writes them", () => {
    expect(wikilinkTargets("See [[Roadmap]], [[Plan|the plan]] and [[Spec#Scope]].")).toEqual(["Roadmap", "Plan", "Spec"]);
  });

  it("resolves a link to the closest document with that title", () => {
    const entry = (path: string, title: string) => ({ id: `id:${path}`, title, path, size: 1, modified: 1, created: 1, updated: 1 });
    const folder = (path: string, extra: any = {}) => ({ name: path, path, folders: [], drawings: [], boards: [], notes: [], assets: [], ...extra });
    const tree: any = {
      projects: [{ path: "P", meta: { name: "P" }, archived: false, root: folder("P", { drawings: [entry("P/Plan.aven", "Plan")], notes: [entry("P/Notes.md", "Notes")] }) }],
      archives: [],
      inbox: folder("D", { boards: [entry("D/Plan.avenboard", "Plan")] }),
      templates: [],
      trash: [],
      state: {},
    };
    expect(resolveLink(tree, "Plan", "P/Notes.md")?.path).toBe("P/Plan.aven");
    expect(resolveLink(tree, "plan", "D/Other.md")?.path).toBe("D/Plan.avenboard");
    expect(resolveLink(tree, "Missing")).toBeNull();
  });

  it("derives a stable, file-safe key for note backups", () => {
    expect(noteKey("C:/A/Note.md")).toMatch(/^note-[0-9a-f]{8}$/);
    expect(noteKey("C:/A/Note.md")).toBe(noteKey("c:/a/note.md"));
    expect(noteKey("C:/A/Note.md")).not.toBe(noteKey("C:/A/Other.md"));
  });
});

describe("diagram from text editing", () => {
  it("nests dash lines written flush under a title", () => {
    const t = parseOutline("Trip\n- Paris\n  - Louvre\n- Rome");
    expect(t).toHaveLength(1);
    expect(t[0].children.map((c) => c.text)).toEqual(["Paris", "Rome"]);
    expect(t[0].children[0].children[0].text).toBe("Louvre");
  });

  it("indents and outdents whole lines", () => {
    const v = "Root\n- A\n- B";
    const r = shiftLines(v, 10, 10, 1);
    expect(r.value).toBe("Root\n- A\n  - B");
    expect(shiftLines(r.value, r.start, r.end, -1).value).toBe(v);
    expect(shiftLines(v, 0, v.length, 1).value).toBe("  Root\n  - A\n  - B");
  });

  it("continues dashes and numbers on Enter, and ends an empty item", () => {
    expect(continueLine("Root\n  - A", 10).value).toBe("Root\n  - A\n  - ");
    expect(continueLine("1. One", 6).value).toBe("1. One\n2. ");
    expect(continueLine("Root\n- ", 7).value).toBe("Root\n");
  });
});

describe("note formatting", () => {
  it("recognises the block kind of a line", () => {
    expect(blockOf("# Title")).toBe("h1");
    expect(blockOf("### Small")).toBe("h3");
    expect(blockOf("  - [x] Done")).toBe("task");
    expect(blockOf("- item")).toBe("bullet");
    expect(blockOf("12. item")).toBe("ordered");
    expect(blockOf("> quote")).toBe("quote");
    expect(blockOf("Plain #tag")).toBe("p");
  });

  it("counts words without Markdown marks", () => {
    expect(wordCount("# Plan\n- [ ] **Book** the venue\n| a | b |")).toBe(6);
  });
});

describe("tables on the canvas", () => {
  const data = (table: string[][], textSize: "s" | "m" | "l" = "m") => ({ ...defaultChartData("table"), table, textSize });

  it("never cuts a word and widens the table when words need room", () => {
    const d = data([["Owner", "Status"], ["Alexandra", "In progress"]], "l");
    const layout = tableLayout({ x: 0, y: 0, width: 120 }, d);
    expect(layout.width).toBeGreaterThan(120);
    for (const cell of layout.cells) for (const line of cell.lines) expect(["Owner", "Status", "Alexandra", "In", "progress", "In progress"]).toContain(line);
  });

  it("wraps long text and makes the row taller", () => {
    const short = tableLayout({ x: 0, y: 0, width: 300 }, data([["Item"], ["Short"]]));
    const long = tableLayout({ x: 0, y: 0, width: 300 }, data([["Item"], ["A much longer description that has to wrap onto several lines"]]));
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.cells[1].lines.length).toBeGreaterThan(1);
  });

  it("finds the cell under a point", () => {
    const d = data([["a", "b"], ["c", "d"]]);
    const layout = tableLayout({ x: 10, y: 20, width: 200 }, d);
    const target = layout.cells.find((c) => c.r === 1 && c.c === 1)!;
    expect(tableCellAt({ x: 10, y: 20, width: 200 }, d, target.x + 2, target.y + 2)).toMatchObject({ r: 1, c: 1 });
    expect(tableCellAt({ x: 10, y: 20, width: 200 }, d, 0, 0)).toBeNull();
  });
});

describe("canvas background and links", () => {
  it("combines a tone with dots on or off, and reads older drawings", () => {
    expect(makeStyle("light", true)).toBe("light-dots");
    expect(canvasTone("dark-dots", "light")).toBe("dark");
    expect(hasDots("light")).toBe(false);
    expect(canvasTone("dots", "light")).toBe("light"); // older "dots" follows the interface
    expect(canvasTone("paper", "dark")).toBe("light");
    expect(backgroundFor("light")).toBe("#f8f7f4");
    expect(backgroundFor("dark-dots")).toBe("transparent");
  });

  it("recognises links the canvas can play", () => {
    expect(normaliseUrl("youtube.com/watch?v=x")).toBe("https://youtube.com/watch?v=x");
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(isEmbeddableUrl("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isEmbeddableUrl("https://vimeo.com/1")).toBe(true);
    expect(isEmbeddableUrl("https://example.org")).toBe(false);
  });
});
