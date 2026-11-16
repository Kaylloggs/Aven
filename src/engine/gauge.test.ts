import { describe, expect, it } from "vitest";
import { createGauge, gaugeData, gaugeIdsIn, layoutGauge, restyleGauge, ringPoints, setGaugeValue } from "./gauge";
import { backgroundFor, dotSpacing, exportBackground, inferStyle, themeFor } from "./canvasStyle";
import { parseDocument, serializeDocument, createDocument } from "./format";

const role = (els: any[], r: string) => els.find((e) => gaugeData(e)?.role === r);

describe("percentage gauges", () => {
  it("creates a grouped bar with fill and label", () => {
    const els = createGauge(100, 50, { value: 40 });
    expect(els).toHaveLength(3);
    const track = role(els, "track");
    const fill = role(els, "fill");
    const label = role(els, "label");
    expect(new Set(els.map((e) => e.groupIds[0])).size).toBe(1);
    expect(fill.width).toBeCloseTo(track.width * 0.4);
    expect(fill.x).toBe(track.x);
    expect(label.text).toBe("40%");
    expect(label.x).toBeGreaterThan(track.x + track.width);
  });

  it("updates value and colour from the track's current size and position", () => {
    const els = createGauge(0, 0, { value: 10 });
    const moved = els.map((e) => (gaugeData(e)?.role === "track" ? { ...e, x: 500, width: 400 } : e));
    const out = layoutGauge(moved, 75, "#567BF7");
    expect(role(out, "fill").x).toBe(500);
    expect(role(out, "fill").width).toBeCloseTo(300);
    expect(role(out, "fill").backgroundColor).toBe("#567BF7");
    expect(role(out, "label").text).toBe("75%");
    expect(gaugeData(role(out, "track"))!.value).toBe(75);
  });

  it("clamps values and hides an empty fill", () => {
    const els = createGauge(0, 0);
    expect(role(layoutGauge(els, 140), "label").text).toBe("100%");
    const zero = layoutGauge(els, -5);
    expect(role(zero, "label").text).toBe("0%");
    expect(role(zero, "fill").opacity).toBe(0);
  });

  it("finds gauges from any selected part and updates several at once", () => {
    const a = createGauge(0, 0);
    const b = createGauge(0, 100);
    const scene = [...a, ...b];
    const ids = gaugeIdsIn(scene, [role(a, "label").id, role(b, "fill").id]);
    expect(ids).toHaveLength(2);
    const out = setGaugeValue(scene, ids, 20);
    expect(out.filter((e) => gaugeData(e)?.role === "label").every((e: any) => e.text === "20%")).toBe(true);
  });

  it("draws ring arcs and switches style in place", () => {
    const pts = ringPoints(0, 0, 10, 10, 25);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[0][1]).toBeCloseTo(-10);
    expect(pts.at(-1)![0]).toBeCloseTo(10);
    expect(pts.at(-1)![1]).toBeCloseTo(0);
    const bar = createGauge(30, 40, { value: 60 });
    const ring = restyleGauge(bar, gaugeData(bar[0])!.gaugeId, "ring");
    const track = role(ring, "track");
    expect(track.type).toBe("ellipse");
    expect(track.x).toBe(30);
    expect(gaugeData(track)!.value).toBe(60);
    expect(role(ring, "fill").type).toBe("line");
  });
});

describe("canvas styles", () => {
  it("maps styles to engine background and theme", () => {
    expect(backgroundFor("dots")).toBe("transparent");
    expect(themeFor("dots", "dark")).toBe("dark");
    expect(themeFor("paper", "dark")).toBe("light");
    expect(themeFor("dark", "light")).toBe("dark");
  });

  it("infers a style for older drawings and never exports a transparent sheet by accident", () => {
    expect(inferStyle({ viewBackgroundColor: "transparent" })).toBe("dots");
    expect(inferStyle({ viewBackgroundColor: "#ffffff" })).toBe("paper");
    expect(inferStyle({ canvasStyle: "dark", viewBackgroundColor: "#ffffff" })).toBe("dark");
    expect(exportBackground("transparent")).toBe("#ffffff");
    expect(exportBackground("#f8f7f4")).toBe("#f8f7f4");
  });

  it("keeps the dot grid readable at any zoom", () => {
    for (const z of [0.1, 0.3, 1, 3, 10]) {
      const s = dotSpacing(z);
      expect(s).toBeGreaterThanOrEqual(11);
      expect(s).toBeLessThanOrEqual(88);
    }
  });

  it("persists the canvas style in the document", () => {
    const d = createDocument("x");
    d.scene.appState.canvasStyle = "dark";
    expect(parseDocument(serializeDocument(d)).scene.appState.canvasStyle).toBe("dark");
    expect(createDocument("y").scene.appState.canvasStyle).toBe("dots");
  });
});
