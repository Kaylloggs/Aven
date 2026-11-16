# Changelog

## 1.2.1 — 2026-11-16

### Added
- **Aven right-click menus everywhere**: the browser's menu no longer appears. The canvas has its own menu (cut, copy, paste at the pointer, duplicate, text style, arrange and flip, group/ungroup, copy and paste style, link, lock, copy as PNG, delete; on empty canvas: paste, select all, undo/redo, diagram from text, charts, gauges, zoom to fit, grid and background). Kanban cards (open, rename, move to a column, labels, delete), column headers, the board background and every text field (undo, cut, copy, paste, select all) get menus too.
- Card labels can be renamed, recoloured and deleted (right-click a label in the card details); new labels get a colour picker.

### Changed
- Colours are picked from swatches that show the colour itself: column colours and project colours no longer list hexadecimal codes.

### Fixed
- A Kanban card lifted on hover was cut off under the column title.
- Menus opened inside a dialog are now shown above it and can be used.


## 1.2.0 — 2026-11-16

### Added
- **Kanban boards**: a new document type (`.avenboard`) living in projects and folders next to drawings. Presets (Kanban, Sprint, Content pipeline, Week planner, Blank), drag and drop of cards and columns, quick card entry, card details (description, checklist with progress, due dates with overdue/soon badges, labels, links to drawings), column colours and card limits (WIP), filtering by text and label, autosave with version history and conflict detection, search (Ctrl+P), export as Markdown, copy for Notion, export to an Obsidian vault in the Kanban-plugin format.
- **Charts and tables on the canvas**: bar, horizontal bar, line, pie, donut and table, built from real editable shapes. Edit data as text ("label, value" lines, or cells pasted from a spreadsheet), title, unit, values on/off and colour palettes; charts re-lay themselves out after resizing.
- **Diagram from text** (Ctrl+Shift+D): an indented list becomes a mind map, org chart, plan or flow (lines ending with "?" become decisions); Mermaid code (flowchart, sequence, class) is converted to editable shapes. Live preview, clean or hand-drawn style.
- **Bold, italic, underline and strikethrough text**: B / I / U / S toolbar when text or labelled shapes are selected, Ctrl+B / Ctrl+I / Ctrl+U. Rendered on canvas, in PNG/PDF and in SVG exports.

### Technical
- The drawing engine gets small hooks at install time (`scripts/patch-engine.mjs`, idempotent, pinned to Excalidraw 0.18.1, fails loudly on mismatch).


## 1.1.0 — 2026-11-16

### Fixed
- The window's close button (red X) did not close Aven: the save-before-close handler lacked the permission to destroy the window. Closing now saves pending work (at most 4 s) and always closes.
- Pressing Enter in a name prompt cancelled it instead of confirming (focus landed on the dialog's close button).
- Rotating a shape back to straight was nearly impossible: rotations that end within 4° of 0°, 90°, 180° or 270° now snap exactly upright (Shift still gives 15° steps).

### Changed
- Layers panel is docked at the bottom right and can stay open together with the Info or Components panel.
- Tool rail separators are thin discreet lines.
- Canvas backgrounds reduced to three looks per drawing: Dots (default, the same dotted texture as the app, follows light/dark and moves with pan and zoom), Off-white and Dark. Set the default in Settings › Appearance, change it per drawing from the Canvas menu.

### Added
- Percentage gauges: bar or ring, inserted from the tool rail; select one to set the value (slider or number), colour and style. Several gauges can be edited at once.
- "Connect your tools" guides: step-by-step setup for Obsidian, Notion (copy, import, API) and Google Drive (desktop folder, API), reachable from the sidebar, Settings › Integrations, the Export dialog and search (Ctrl+P).


## 1.0.0 — 2026-11-16

First release.

### Added
- Desktop app (Tauri 2) with Windows NSIS installer, `.aven` file association, per-user install.
- Infinite canvas powered by the Excalidraw engine (MIT) with Aven's own tool rail, top bar, theme and shortcuts; presets for square, circle, rounded rectangle, double arrow and elbow connector.
- Native `.aven` format (versioned, migrations, embedded images, layers, components, links, metadata); import of `.excalidraw`.
- Workspaces in user-chosen folders, multiple workspaces, projects, nested folders, loose drawings, archives, trash with restore and auto-purge, favorites, pins, project colours and descriptions, drag and drop moves.
- Home dashboard with creation tiles, recent drawings, favorites, pinned and all projects, thumbnails, grid/list views, sorting and filtering.
- Full-text search across drawing titles and canvas text (SQLite FTS5), command palette (Ctrl+P).
- Autosave, version history with rotation, crash recovery, conflict detection, corruption recovery screen, scheduled workspace backups and restore.
- 40 built-in editable templates, template gallery, personal templates, template packs.
- Optional Advanced Editing: layers (visibility, lock, opacity, order, groups, duplicate) and components with linked instances.
- Connected drawings: links, shape links to drawings, backlinks, knowledge map.
- Export to PNG, SVG, PDF, JPEG, WebP, JSON and `.aven`, with scale, background, dark mode, padding, selection and per-frame export.
- Obsidian export (vault detection, frontmatter, wikilinks or Markdown links, optional source copy).
- Notion: Notion-ready folder, copy image, optional API publishing.
- Google Drive: export to the Google Drive for desktop folder, optional API upload with OAuth.
- Settings: appearance, workspace and storage, backups, editor defaults, customisable shortcuts, advanced editing, export defaults, integrations, diagnostics.
- "Envol" brand identity and "Atelier" interface design.

### Design iterations
- Logo: monochrome A monogram (rejected as too corporate) → colourful primitives → four new non-letter directions → final origami bird "Envol" chosen by the user.
- Interface: first pass restrained graphite UI → "Atelier" redesign after feedback asking for a more original, creative look.
