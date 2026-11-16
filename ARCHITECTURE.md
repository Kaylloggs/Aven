# Architecture

## Technology choices

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2 (Rust) | Small installer, native file access, uses the system WebView2 instead of bundling Chromium |
| UI | React 19 + TypeScript + Vite 8 | Required by the brief; the drawing engine is a React component |
| Styling | Tailwind CSS 4 with OKLCH design tokens (`src/styles/app.css`) | One token set drives light, dark and accent themes |
| State | Zustand | Tiny, no providers, selectors avoid needless re-renders |
| Drawing engine | `@excalidraw/excalidraw` 0.18 (MIT), used as a package | Proven infinite canvas with every Excalidraw tool, shortcut, library and export. Rebuilding it would take months and be less reliable. |
| Metadata | SQLite (rusqlite, bundled) | Recent files, header cache, full-text search (FTS5), link graph |
| Files | JSON (`.aven`), versioned | Portable, diffable, embeds images |

## Engine evaluation

- **Canvas 2D from scratch:** full control but huge effort to reach parity (text editing, bindings, elbow arrows, frames, eraser, laser, libraries, crop, i18n of hit testing). Rejected.
- **SVG renderer:** slow beyond a few thousand elements. Rejected.
- **WebGL:** fastest for huge scenes, but text and hand-drawn rendering would all be custom. Rejected for v1.
- **Excalidraw engine (chosen):** MIT licensed, Canvas 2D with caching, used unmodified from npm. Its UI chrome (toolbar, menus, help) is hidden and replaced by Aven's; its property panels are re-skinned with Aven tokens (`src/styles/engine-theme.css`). License and attribution are in `THIRD_PARTY_NOTICES.md` and the About screen.

The engine is isolated behind `src/features/editor/session.ts` (the only place that talks to the canvas API) and `src/engine/*` (pure functions on element arrays). Home, project management, templates and integrations never import the canvas component.

## Engine hooks (text styles)

Excalidraw stores no bold/italic/underline flags, so Aven keeps them in `element.customData` and adds tiny hooks to the engine bundles at install time (`scripts/patch-engine.mjs`, run by `postinstall`, `dev` and `build`; idempotent; pinned to 0.18.1 and failing loudly if the engine changes):

1. the font-string builder prefixes `italic`/`bold` from customData (canvas, measuring, the text editor, SVG);
2. the font-size parser ignores that prefix;
3. canvas text rendering calls `globalThis.__avenDecorate` per line (underline, strikethrough);
4. SVG export calls `globalThis.__avenDecorateSvg` per `<text>` (font-weight, font-style, text-decoration);
5. the engine's text re-measure function is exposed as `globalThis.__avenRedrawText` so labels re-wrap and containers grow after a style change.

The hook implementations live in `src/engine/textStyle.ts` and are unit-tested.

## Kanban boards

`.avenboard` JSON files (`src/engine/board.ts`: columns with ordered card ids, a card map, labels). The backend scans them like drawings (`FolderNode.boards`); they are saved through the same `drawing_write` command (atomic write, version history, conflict detection), indexed for search, and exported to Markdown or the Obsidian Kanban-plugin format. The parser repairs files where a card is missing from every column or listed twice.

## Generated content (gauges, charts, diagrams)

Gauges (`engine/gauge.ts`) and charts and tables (`engine/charts.ts`) are groups of ordinary elements tagged in `customData`; the source data lives on one element (gauge track, chart box) and the rest is regenerated from it, also after a resize. Diagrams from text (`features/editor/textDiagram.ts`) use the template Board builder; Mermaid goes through `@excalidraw/mermaid-to-excalidraw`, loaded on demand.

## Process model

```
┌──────────────────────── WebView2 (React) ─────────────────────────┐
│ features/home, settings, templates ──► store/workspace ─┐         │
│ features/editor ── EditorSession ─► Excalidraw canvas   │         │
│ engine/ (format, layers, components, export, pdf)       ▼         │
│                                     platform/api.ts (invoke)      │
└──────────────────────────────────────────┬────────────────────────┘
                                           │ Tauri IPC (JSON)
┌──────────────────────── Rust backend ────▼────────────────────────┐
│ commands.rs  ── workspace.rs (scan, projects, trash, archive, IO) │
│              ── backup.rs (zip snapshots, recovery files)         │
│              ── db.rs (SQLite: recents, header cache, FTS, links) │
│              ── integrations.rs (Obsidian, Drive, Notion, secrets)│
│              ── fsops.rs (atomic write, safe names, copy/move)    │
└───────────────────────────────────────────────────────────────────┘
```

## Storage layout

```
<workspace>/
  aven-workspace.json      { id, name, createdAt, formatVersion }
  Projects/<Project>/      .aven-project.json + nested folders + *.aven + assets
  Drawings/                drawings outside any project
  Templates/<Category>/    personal templates (*.aven with meta.isTemplate)
  Libraries/               components.avenlib, library.excalidrawlib
  Archives/<Project>/      archived projects
  .aven/backups/<id>/      automatic versions per drawing (rotated)
  .aven/thumbs/<id>.png    thumbnails (cache)
  .aven/trash/<slot>/      deleted items + trash.json (restore info)
  .aven/snapshots/         default location of workspace backups
  .aven/state.json         favorites, template favorites, recent templates

%APPDATA%/app.aven.desktop/   settings.json, workspaces.json (registry),
                               aven.db (SQLite index), recovery/*.json
```

The workspace folder is the source of truth. The SQLite database is an index that can be deleted at any time; a damaged database is moved aside and rebuilt on start.

## Native document format (`.aven`, format version 1)

```jsonc
{
  "type": "aven-drawing", "version": 1,
  "id": "uuid", "title": "…", "createdAt": 0, "updatedAt": 0,
  "app": { "name": "Aven", "version": "1.0.0" },
  "scene": { "elements": [], "appState": { "viewBackgroundColor": "#fff", "gridSize": 20, … }, "files": { "<fileId>": { "dataURL": "data:image/png;base64,…" } } },
  "layers": null | { "layers": [LayerDef], "activeLayerId": "…", "hidden": [elements on hidden layers] },
  "components": [ComponentDef],   // masters used by linked instances in this drawing
  "links": [{ "id": "drawing-id", "kind": "drawing", "label": "…" }],
  "meta": { "tags": [], "description": "", "templateId"?: "…", "isTemplate"?: true }
}
```

- Images are embedded (`scene.files`), so a drawing survives being moved to another computer. Unused files are pruned on save.
- `migrate()` (`src/engine/format.ts`) upgrades older versions step by step and refuses files from newer versions with a clear message.
- Excalidraw `.excalidraw` scenes are imported directly and exported via the JSON format.

## Data safety

- **Atomic writes:** every save writes a sibling temp file, `fsync`s it, then renames over the target (`fsops::atomic_write`).
- **Validation:** the backend refuses to save content that is not valid JSON.
- **Conflict detection:** saves carry the file's last known modification time; if another program changed the file, Aven stops and offers *overwrite*, *load disk version* or *save mine as a copy*.
- **Version history:** before overwriting, the previous file is copied to `.aven/backups/<id>/` at most once per configurable interval and rotated to a configurable count.
- **Crash recovery:** unsaved changes are mirrored to `recovery/<id>.json` every ~1 s while dirty; on reopening, Aven offers to restore them. Cleared after a successful save.
- **Corruption:** a damaged file opens a recovery screen listing its automatic backups.
- **Trash:** deletions move items into `.aven/trash` with restore metadata; permanent deletion requires confirmation; auto-purge after a configurable number of days.
- **Workspace backups:** zip snapshots on a schedule (daily/weekly) to a folder you choose, rotated; restoring always creates a new folder (never overwrites).
- **Relocation:** moving a workspace copies, verifies sizes, then removes the original.

## Editor and engine integration

`EditorSession` (`src/features/editor/session.ts`) owns one open drawing:
- receives canvas `onChange` events, detects real content changes via the scene version, and debounces autosave and recovery writes;
- builds the `.aven` document on save, then (debounced) renders the thumbnail, updates the FTS index and the link graph;
- applies the optional layer system: assigns new elements to the active layer when the user is idle, keeps z-order grouped by layer, moves hidden-layer elements out of the canvas and back;
- survives React's development double mount and hot reloads (reference-counted activation).

Tools: the left rail calls `setActiveTool`. Presets (square, circle, rounded rectangle, double arrow, connector) set engine defaults (`currentItemRoundness`, arrowheads, elbow arrows) and normalise squares/circles on pointer-up.

## Layers (optional)

Pure functions in `src/engine/layers.ts`. Membership lives in `element.customData.avenLayer`. Locks set `element.locked` and remember that the layer (not the user) locked it. Layer opacity multiplies the element's own opacity and remembers the base value so it can be restored. Group layers cascade visibility, lock and opacity. Turning advanced editing off shows every layer in the standard editor without deleting layer data.

## Components (optional)

`src/engine/components.ts`. A component stores elements normalised to (0,0). Instances are cloned with fresh ids (all internal references remapped) and grouped; each element carries `{componentId, instanceId, version}`. "Push changes" updates the master from an instance; other instances can be synced (kept in place) or left as they are, and outdated instances are flagged. Detach removes the link. The personal library is `Libraries/components.avenlib` (shared by all drawings in the workspace); the drawing also stores the masters it uses so it stays portable. Excalidraw `.excalidrawlib` files can be imported as components.

## Search and knowledge graph

SQLite FTS5 indexes each drawing's title, project and all text on the canvas (`extractText`). Links come from explicit document links and from shape links using the `aven://drawing/<id>` scheme; they feed backlinks in the Info panel and the force-directed knowledge map.

## Export pipeline

`src/engine/export.ts` renders with the engine's exporters: PNG/JPEG/WebP via `exportToBlob` with explicit scale, SVG via `exportToSvg` (vector, fonts inlined), PDF via a dependency-free writer (`src/engine/pdf.ts`, lossless Flate-compressed RGB, one page per frame), JSON (Excalidraw-compatible) and native `.aven`. Scopes: whole canvas, selection (with bound text and groups) or frames (one file/page each).

Destinations (`src/features/export/actions.ts`):
- **Files:** save dialog; multiple outputs go to a chosen folder.
- **Obsidian:** writes the image to the attachments folder and a Markdown note with YAML frontmatter, embedding the image as `![[wikilink]]` or a relative Markdown link (`src/features/export/markdown.ts`). Vaults are detected from Obsidian's own `obsidian.json`.
- **Notion:** offline "Notion-ready" folder (Markdown + image for Notion's Import), copy image to clipboard, and optional direct publishing through the Notion API (file upload + page creation) with the secret stored in Windows Credential Manager.
- **Google Drive:** write into the Google Drive for desktop folder (auto-detected; works offline), or upload through the Drive API with OAuth 2.0 loopback + PKCE (user-provided OAuth client; refresh token stored in Windows Credential Manager; scope `drive.file`).

## Integration extensibility

New destinations follow the same shape: a pure formatter (testable) in `features/export`, an action that renders with `exportDocument`, and, when network or secrets are needed, a Rust command in `integrations.rs`. Secrets never reach the frontend.

## Performance notes

- The canvas component is memoised and receives stable props; editor UI state is updated only when values actually change.
- Workspace scans reuse a SQLite header cache keyed by path, mtime and size, so unchanged files are not re-parsed.
- Thumbnails are generated after saves (debounced) and lazy-loaded on cards; template previews render on scroll into view.
- The release binary is built with LTO and `opt-level = "s"`.
