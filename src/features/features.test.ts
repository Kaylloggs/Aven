import { describe, expect, it, beforeEach } from "vitest";
import { exportFileName, frontmatter, mdPath, notionMarkdown, obsidianNote, safeNoteName, drawingTexts, parsePageId, type NoteMeta } from "./export/markdown";
import { normalizeSettings, DEFAULT_SETTINGS } from "@/store/settings";
import { basename, dirname, isInside, join, relativeUnix, safeFileName, stem } from "@/lib/path";
import { eventToShortcut, formatBytes, shortcutLabel } from "@/lib/utils";
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from "./templates/builtin";
import { SHORTCUTS, bindingFor } from "./shortcuts/registry";
import { mockInvoke, resetMock } from "@/platform/mock";

const meta: NoteMeta = {
  title: "Roadmap: Q3 [draft]",
  project: "Website",
  tags: ["planning", "team work"],
  description: "Quarterly plan",
  created: Date.UTC(2026, 0, 2),
  updated: Date.UTC(2026, 0, 3),
  avenId: "abc",
  text: ["Launch", "Multi\nline"],
};

describe("Obsidian and Notion markdown", () => {
  it("makes names valid for Obsidian and Windows", () => {
    expect(safeNoteName("Roadmap: Q3 [draft]")).toBe("Roadmap- Q3 -draft-");
    expect(safeNoteName("  ...  ")).toBe("Untitled");
    expect(exportFileName("{project} - {title}", { title: "A/B", project: "P", date: Date.UTC(2026, 4, 1) })).toBe("P - A-B");
    expect(exportFileName("{title} {date}", { title: "X", date: Date.UTC(2026, 4, 1) })).toBe("X 2026-05-01");
  });

  it("writes frontmatter with safe yaml and tags", () => {
    const fm = frontmatter(meta);
    expect(fm).toContain('title: "Roadmap: Q3 [draft]"');
    expect(fm).toContain("  - team-work");
    expect(fm).toContain("created: 2026-01-02");
    expect(fm).toContain("aven-id: abc");
  });

  it("embeds the image with wikilinks or relative markdown links", () => {
    const wiki = obsidianNote(meta, { imageVaultPath: "Aven/Attachments/Roadmap.png", imageRelPath: "Attachments/Roadmap.png", linkStyle: "wikilink", frontmatter: true });
    expect(wiki).toContain("![[Aven/Attachments/Roadmap.png]]");
    expect(wiki.startsWith("---")).toBe(true);
    expect(wiki).toContain("- Multi line");
    const md = obsidianNote(meta, { imageVaultPath: "x", imageRelPath: "../Att files/My (1).png", linkStyle: "markdown", frontmatter: false });
    expect(md).toContain("](../Att%20files/My%20(1).png)");
    expect(md.startsWith("# ")).toBe(true);
  });

  it("produces Notion-importable markdown", () => {
    const n = notionMarkdown(meta, "Roadmap.png");
    expect(n).toContain("# Roadmap: Q3 [draft]");
    expect(n).toContain("![Roadmap: Q3 [draft]](Roadmap.png)");
    expect(n).toContain("Project: Website");
  });

  it("encodes link paths and extracts drawing text", () => {
    expect(mdPath("a b/c#d.png")).toBe("a%20b/c%23d.png");
    expect(drawingTexts([{ type: "text", text: "a" }, { type: "text", originalText: "b", isDeleted: true }, { type: "rectangle" }])).toEqual(["a"]);
  });

  it("parses Notion page ids from links", () => {
    expect(parsePageId("https://www.notion.so/team/My-page-0123456789abcdef0123456789abcdef?pvs=4")).toBe("0123456789abcdef0123456789abcdef");
    expect(parsePageId("01234567-89ab-cdef-0123-456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });
});

describe("paths and utilities", () => {
  it("handles Windows paths", () => {
    expect(join("C:\\W\\", "Projects", "A")).toBe("C:\\W\\Projects\\A");
    expect(dirname("C:\\W\\a.aven")).toBe("C:\\W");
    expect(basename("C:\\W\\a.aven")).toBe("a.aven");
    expect(stem("C:\\W\\a.b.aven")).toBe("a.b");
    expect(isInside("C:\\W\\P\\x", "c:\\w\\p")).toBe(true);
    expect(isInside("C:\\W\\Px", "C:\\W\\P")).toBe(false);
    expect(relativeUnix("C:\\V\\Notes", "C:\\V\\Att\\a.png")).toBe("../Att/a.png");
    expect(safeFileName("con")).toBe("con_");
  });

  it("formats sizes and shortcuts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(shortcutLabel("Mod+Shift+E")).toBe("Ctrl+Shift+E");
    expect(eventToShortcut(new KeyboardEvent("keydown", { key: "e", ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+E");
  });
});

describe("settings", () => {
  it("fills missing values with defaults and keeps user values", () => {
    const s = normalizeSettings({ appearance: { theme: "light" }, export: { obsidian: { folder: "Drawings" } } });
    expect(s.appearance.theme).toBe("light");
    expect(s.appearance.accent).toBe(DEFAULT_SETTINGS.appearance.accent);
    expect(s.export.obsidian.folder).toBe("Drawings");
    expect(s.export.obsidian.attachmentsFolder).toBe(DEFAULT_SETTINGS.export.obsidian.attachmentsFolder);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("templates and shortcuts registry", () => {
  it("ships 40 built-in templates across five categories", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(40);
    for (const c of TEMPLATE_CATEGORIES) expect(BUILTIN_TEMPLATES.filter((t) => t.category === c)).toHaveLength(8);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(40);
  });

  it("every template builds editable elements with valid references", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const b = t.build();
      expect(b.els.length, t.id).toBeGreaterThan(3);
      const ids = new Set(b.els.map((e: any) => e.id).filter(Boolean));
      for (const e of b.els as any[]) {
        if (e.start?.id) expect(ids.has(e.start.id), `${t.id} arrow start`).toBe(true);
        if (e.end?.id) expect(ids.has(e.end.id), `${t.id} arrow end`).toBe(true);
        if (e.children) for (const c of e.children) expect(ids.has(c), `${t.id} frame child`).toBe(true);
        for (const k of ["x", "y"]) expect(Number.isFinite(e[k]), `${t.id} ${k}`).toBe(true);
      }
    }
  });

  it("has unique ids and no conflicting default bindings", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    const aven = SHORTCUTS.filter((s) => s.kind === "aven" && s.keys);
    const seen = new Map<string, string>();
    for (const s of aven) {
      const key = `${s.scope}:${s.keys}`;
      expect(seen.has(key), `${s.id} clashes with ${seen.get(key)}`).toBe(false);
      seen.set(key, s.id);
    }
    expect(bindingFor("app.search", { "app.search": "Mod+K" })).toBe("Mod+K");
  });
});

describe("workspace flows (browser backend)", () => {
  beforeEach(() => resetMock());

  it("creates, moves, trashes and restores items", async () => {
    const ws: any = await mockInvoke("ws_create", { name: "Test", parent: "C:\\Users\\me" });
    const [proj]: any = await mockInvoke("project_create", { wsId: ws.id, name: "Site", meta: {} });
    const d = (await mockInvoke("drawing_create", { dir: proj, title: "Home", content: JSON.stringify({ type: "aven-drawing", version: 1, id: "d1", title: "Home", scene: { elements: [] } }) })) as string;
    let tree: any = await mockInvoke("ws_scan", { id: ws.id });
    expect(tree.projects[0].root.drawings[0].id).toBe("d1");
    const folder = (await mockInvoke("folder_create", { parent: proj, name: "Sketches" })) as string;
    const moved = (await mockInvoke("item_move", { path: d, destDir: folder })) as string;
    tree = await mockInvoke("ws_scan", { id: ws.id });
    expect(tree.projects[0].root.folders[0].drawings[0].path).toBe(moved);
    const t: any = await mockInvoke("item_trash", { wsId: ws.id, path: moved });
    tree = await mockInvoke("ws_scan", { id: ws.id });
    expect(tree.trash).toHaveLength(1);
    await mockInvoke("trash_restore", { wsId: ws.id, id: t.id });
    tree = await mockInvoke("ws_scan", { id: ws.id });
    expect(tree.trash).toHaveLength(0);
    expect(tree.projects[0].root.folders[0].drawings).toHaveLength(1);
    const archived = (await mockInvoke("project_set_archived", { wsId: ws.id, path: proj, archived: true })) as string;
    tree = await mockInvoke("ws_scan", { id: ws.id });
    expect(tree.archives[0].path).toBe(archived);
  });
});
