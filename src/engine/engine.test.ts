import { describe, expect, it } from "vitest";
import { createDocument, extractLinkTargets, extractText, FormatError, migrate, parseDocument, pruneFiles, serializeDocument, toExcalidrawScene, drawingLink } from "./format";
import { addLayer, applyLayers, assignNewElements, createLayerState, duplicateLayer, elementIdsInLayer, groupLayers, isSorted, layerIdOf, moveElementsToLayer, moveLayer, removeLayer, sortByLayer, updateLayer, flattenForStandardEditor } from "./layers";
import { createComponent, detachInstance, instanceRef, instancesOf, instantiate, outdatedInstances, parseLibrary, serializeLibrary, syncInstances, updateFromInstance, mergeComponents } from "./components";
import { cloneWithNewIds, getBounds, withProps } from "./elements";
import { buildPdf } from "./pdf";
import { AVEN_FORMAT_VERSION, type ExcalidrawElement } from "./types";

let seq = 0;
function rect(over: Partial<any> = {}): ExcalidrawElement {
  seq++;
  return {
    id: `el${seq}`,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    strokeColor: "#000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...over,
  } as ExcalidrawElement;
}

describe("document format", () => {
  it("round-trips a document", () => {
    const d = createDocument("Plan");
    d.scene.elements = [rect({ id: "a" })];
    d.meta.tags = ["x"];
    const back = parseDocument(serializeDocument(d));
    expect(back.id).toBe(d.id);
    expect(back.title).toBe("Plan");
    expect(back.scene.elements).toHaveLength(1);
    expect(back.meta.tags).toEqual(["x"]);
    expect(back.version).toBe(AVEN_FORMAT_VERSION);
  });

  it("drops deleted elements and unused files on save", () => {
    const d = createDocument("Files");
    d.scene.elements = [rect({ id: "img", type: "image", fileId: "f1" } as any), rect({ id: "gone", isDeleted: true })];
    d.scene.files = { f1: { id: "f1", dataURL: "data:x", mimeType: "image/png", created: 1 } as any, f2: { id: "f2", dataURL: "data:y", mimeType: "image/png", created: 1 } as any };
    expect(Object.keys(pruneFiles(d))).toEqual(["f1"]);
    const saved = JSON.parse(serializeDocument(d));
    expect(saved.scene.elements.map((e: any) => e.id)).toEqual(["img"]);
    expect(Object.keys(saved.scene.files)).toEqual(["f1"]);
  });

  it("migrates legacy drafts and refuses newer formats", () => {
    const legacy = { type: "aven-drawing", id: "old", title: "Old", elements: [rect()], appState: { viewBackgroundColor: "#eee" } };
    const doc = parseDocument(JSON.stringify(legacy));
    expect(doc.scene.elements).toHaveLength(1);
    expect(doc.scene.appState.viewBackgroundColor).toBe("#eee");
    expect(() => migrate({ type: "aven-drawing", version: 999 })).toThrow(FormatError);
  });

  it("reports damaged and foreign files clearly", () => {
    expect(() => parseDocument("{oops")).toThrow(/damaged/);
    expect(() => parseDocument(JSON.stringify({ type: "something-else" }))).toThrow(/not an Aven drawing/);
  });

  it("imports and exports Excalidraw scenes", () => {
    const ex = { type: "excalidraw", version: 2, elements: [rect({ id: "r" })], appState: { viewBackgroundColor: "#fff" }, files: {} };
    const doc = parseDocument(JSON.stringify(ex), "From Excalidraw");
    expect(doc.title).toBe("From Excalidraw");
    expect(doc.scene.elements[0].id).toBe("r");
    const out = JSON.parse(toExcalidrawScene(doc));
    expect(out.type).toBe("excalidraw");
    expect(out.elements).toHaveLength(1);
  });

  it("extracts searchable text and drawing links", () => {
    const d = createDocument("Search me");
    d.scene.elements = [rect({ type: "text", text: "hello", originalText: "hello world" } as any), rect({ link: drawingLink("target-1") }), rect({ type: "frame", name: "Frame A" } as any)];
    d.links = [{ id: "target-2", kind: "drawing", label: "see also" }];
    const text = extractText(d);
    expect(text).toContain("hello world");
    expect(text).toContain("Frame A");
    expect(extractLinkTargets(d).map((l) => l.id).sort()).toEqual(["target-1", "target-2"]);
  });
});

describe("elements helpers", () => {
  it("clones with consistent new ids", () => {
    const box = rect({ id: "box", groupIds: ["g1"], boundElements: [{ id: "label", type: "text" }] });
    const label = rect({ id: "label", type: "text", containerId: "box", groupIds: ["g1"] } as any);
    const arrow = rect({ id: "arr", type: "arrow", startBinding: { elementId: "box", focus: 0, gap: 1 }, endBinding: { elementId: "outside", focus: 0, gap: 1 } } as any);
    const [b2, l2, a2] = cloneWithNewIds([box, label, arrow], { dx: 10 }) as any[];
    expect(b2.id).not.toBe("box");
    expect(l2.containerId).toBe(b2.id);
    expect(b2.boundElements[0].id).toBe(l2.id);
    expect(a2.startBinding.elementId).toBe(b2.id);
    expect(a2.endBinding).toBeNull();
    expect(b2.groupIds[0]).toBe(l2.groupIds[0]);
    expect(b2.groupIds[0]).not.toBe("g1");
    expect(b2.x).toBe(10);
  });

  it("computes bounds including linear points", () => {
    const line = rect({ type: "line", x: 10, y: 10, points: [[0, 0], [50, -20]] } as any);
    const b = getBounds([rect({ x: 0, y: 0, width: 20, height: 20 }), line]);
    expect(b).toMatchObject({ minX: 0, minY: -10, maxX: 60, maxY: 20 });
  });

  it("bumps versions on update", () => {
    const r = rect();
    expect(withProps(r, { x: 5 }).version).toBe(2);
  });
});

describe("layers", () => {
  const scene = () => [rect({ id: "a" }), rect({ id: "b" }), rect({ id: "c" })];

  it("puts existing elements on the first layer and new ones on the active layer", () => {
    const { state, elements } = createLayerState(scene());
    expect(elements.every((e) => layerIdOf(e, state) === state.layers[0].id)).toBe(true);
    const s2 = addLayer(state, "Top");
    const r = assignNewElements([...elements, rect({ id: "new" })], s2);
    expect(r.changed).toBe(true);
    expect(layerIdOf(r.elements.find((e) => e.id === "new")!, s2)).toBe(s2.activeLayerId);
  });

  it("hides, shows, locks and fades layers", () => {
    let { state, elements } = createLayerState(scene());
    state = addLayer(state, "Top");
    elements = moveElementsToLayer(elements, new Set(["c"]), state.activeLayerId);
    const top = state.activeLayerId;
    let r = applyLayers(elements, updateLayer(state, top, { visible: false }));
    expect(r.scene.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.state.hidden.map((e) => e.id)).toEqual(["c"]);
    r = applyLayers(r.scene, { ...updateLayer(r.state, top, { visible: true, locked: true }) });
    expect(r.scene.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(r.scene.find((e) => e.id === "c")!.locked).toBe(true);
    r = applyLayers(r.scene, updateLayer(r.state, top, { locked: false, opacity: 50 }));
    const c = r.scene.find((e) => e.id === "c")!;
    expect(c.locked).toBe(false);
    expect(c.opacity).toBe(50);
    r = applyLayers(r.scene, updateLayer(r.state, top, { opacity: 100 }));
    expect(r.scene.find((e) => e.id === "c")!.opacity).toBe(100);
  });

  it("keeps the user's own locks when a layer is unlocked", () => {
    const { state, elements } = createLayerState([rect({ id: "mine", locked: true }), rect({ id: "free" })]);
    const locked = applyLayers(elements, updateLayer(state, state.layers[0].id, { locked: true }));
    const unlocked = applyLayers(locked.scene, updateLayer(locked.state, state.layers[0].id, { locked: false }));
    expect(unlocked.scene.find((e) => e.id === "mine")!.locked).toBe(true);
    expect(unlocked.scene.find((e) => e.id === "free")!.locked).toBe(false);
  });

  it("orders elements by layer and reorders layers", () => {
    let { state, elements } = createLayerState(scene());
    state = addLayer(state, "Top");
    elements = moveElementsToLayer(elements, new Set(["a"]), state.activeLayerId);
    expect(isSorted(elements, state)).toBe(false);
    const sorted = sortByLayer(elements, state);
    expect(sorted.map((e) => e.id)).toEqual(["b", "c", "a"]);
    const moved = moveLayer(state, state.activeLayerId, 0);
    expect(sortByLayer(sorted, moved).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("deletes layers with or without their elements", () => {
    let { state, elements } = createLayerState(scene());
    state = addLayer(state, "Top");
    elements = moveElementsToLayer(elements, new Set(["c"]), state.activeLayerId);
    const keep = removeLayer(elements, state, state.activeLayerId, true);
    expect(keep.scene.filter((e) => !e.isDeleted)).toHaveLength(3);
    expect(keep.state.layers).toHaveLength(1);
    const drop = removeLayer(elements, state, state.activeLayerId, false);
    expect(drop.scene.filter((e) => !e.isDeleted).map((e) => e.id)).toEqual(["a", "b"]);
    expect(removeLayer(elements, keep.state, keep.state.layers[0].id, false).state.layers).toHaveLength(1);
  });

  it("duplicates, selects and groups layers", () => {
    const { state, elements } = createLayerState(scene());
    const id = state.layers[0].id;
    const dup = duplicateLayer(elements, state, id, (els, layerId) => cloneWithNewIds(els).map((e) => ({ ...e, customData: { avenLayer: layerId } })));
    expect(dup.scene).toHaveLength(6);
    expect(elementIdsInLayer(dup.scene, dup.state, dup.state.activeLayerId)).toHaveLength(3);
    const grouped = groupLayers(dup.state, [id], "G");
    const g = grouped.layers.find((l) => l.kind === "group")!;
    expect(grouped.layers.find((l) => l.id === id)!.parentId).toBe(g.id);
    const hiddenGroup = applyLayers(dup.scene, updateLayer(grouped, g.id, { visible: false }));
    expect(hiddenGroup.scene).toHaveLength(3);
  });

  it("shows everything when advanced editing is turned off", () => {
    const { state, elements } = createLayerState(scene());
    const hidden = applyLayers(elements, updateLayer(state, state.layers[0].id, { visible: false }));
    expect(hidden.scene).toHaveLength(0);
    const flat = flattenForStandardEditor(hidden.scene, hidden.state);
    expect(flat.scene).toHaveLength(3);
    expect(flat.state.hidden).toHaveLength(0);
  });
});

describe("components", () => {
  const base = () => [rect({ id: "a", x: 100, y: 200 }), rect({ id: "b", x: 150, y: 260, width: 20, height: 20 })];

  it("normalises a component to the origin", () => {
    const c = createComponent(base(), {}, "Card", "UI");
    const b = getBounds(c.elements);
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(c.elements.every((e) => !["a", "b"].includes(e.id))).toBe(true);
  });

  it("creates linked instances and finds them", () => {
    const c = createComponent(base(), {}, "Card");
    const i1 = instantiate(c, 0, 0);
    const i2 = instantiate(c, 500, 0);
    const scene = [...i1, ...i2];
    expect(instancesOf(scene, c.id).size).toBe(2);
    expect(instanceRef(i1[0])!.version).toBe(1);
    expect(getBounds(i2).minX).toBe(500);
    // each instance is grouped so it moves as a unit
    expect(i1.every((e) => e.groupIds.includes(i1[0].groupIds.at(-1)!))).toBe(true);
  });

  it("pushes changes from one instance to the others, or leaves them", () => {
    const c = createComponent(base(), {}, "Card");
    const i1 = instantiate(c, 0, 0);
    const i2 = instantiate(c, 500, 0);
    const edited = i1.map((e, idx) => (idx === 0 ? { ...e, backgroundColor: "#ff0000" } : e));
    const v2 = updateFromInstance(c, edited, {});
    expect(v2.version).toBe(2);
    const scene = [...edited, ...i2];
    const id1 = instanceRef(i1[0])!.instanceId;
    expect(outdatedInstances(scene, v2)).toHaveLength(2);
    const synced = syncInstances(scene, v2, undefined, id1);
    expect(outdatedInstances(synced, v2)).toHaveLength(0);
    const second = instancesOf(synced, c.id).get(instanceRef(i2[0])!.instanceId)!;
    expect(second.some((e) => e.backgroundColor === "#ff0000")).toBe(true);
    expect(getBounds(second).minX).toBe(500);
    const onlyMine = syncInstances(scene, v2, new Set([id1]), id1);
    expect(outdatedInstances(onlyMine, v2)).toHaveLength(1);
  });

  it("detaches an instance", () => {
    const c = createComponent(base(), {}, "Card");
    const i1 = instantiate(c, 0, 0);
    const d = detachInstance(i1, instanceRef(i1[0])!.instanceId);
    expect(d.every((e) => instanceRef(e) === null)).toBe(true);
  });

  it("reads Aven and Excalidraw libraries", () => {
    const c = createComponent(base(), {}, "Card");
    expect(parseLibrary(serializeLibrary("Mine", [c]))[0].id).toBe(c.id);
    const exLib = { type: "excalidrawlib", version: 2, libraryItems: [{ id: "x", name: "Server", elements: base() }] };
    const parsed = parseLibrary(JSON.stringify(exLib));
    expect(parsed[0].name).toBe("Server");
    expect(() => parseLibrary("{}")).toThrow();
    expect(mergeComponents([c], [{ ...c, version: 3 }])[0].version).toBe(3);
  });
});

describe("pdf writer", () => {
  it("writes a valid single-page PDF with a correct xref table", async () => {
    const w = 4;
    const h = 2;
    const pixels = new Uint8ClampedArray(w * h * 4).fill(255);
    const bytes = await buildPdf([{ widthPt: 30, heightPt: 15, pixels, pxWidth: w, pxHeight: h }], { title: "Café plan" });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.7")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Page ");
    expect(text).toContain("/Count 1");
    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    // every xref offset points at "N 0 obj"
    const entries = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  it("writes one page per frame", async () => {
    const page = { widthPt: 10, heightPt: 10, pixels: new Uint8ClampedArray(4).fill(0), pxWidth: 1, pxHeight: 1 };
    const text = new TextDecoder("latin1").decode(await buildPdf([page, page, page], { title: "Deck" }));
    expect(text).toContain("/Count 3");
    await expect(buildPdf([], { title: "x" })).rejects.toThrow();
  });
});
