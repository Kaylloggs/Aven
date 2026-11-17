# Changelog

## 1.5.0 — 2026-11-17

### Added
- **Canva-style object bars**: selecting a table, chart, gauge, diagram or text shows a small bar right above it with its controls; it follows scrolling and zooming and steps aside while you move the object.
- **Tables you edit on the canvas**: double-click a cell to type (Enter goes down, Tab to the next cell, Escape cancels). Columns share the width by content and never cut a word, text wraps and rows grow, and the table widens when it needs room. Styles: header colour (or a plain header), striped rows, cell lines, and small, medium or large text. The data panel opens from the bar when you want the spreadsheet view.
- **Diagrams from text stay editable as one object**: switch between mind map, org chart, plan and flow, toggle the hand-drawn style, or edit the text, and the diagram redraws in place.
- **Several images at once**: the Images button takes several files, and images dropped on the canvas land in a tidy grid where you drop them. Very large photos are scaled down.
- **Links and videos**: paste a YouTube, Vimeo, Figma (and a few other) link to play it inside the canvas; any other site becomes a link card that opens in the browser.

### Changed
- The whiteboard tool bar is centred vertically on the left, and the note toolbar is a vertical bar on the left as well.
- The "/" menu in notes is grouped (Text, Lists, Blocks, Links) with an icon and a short description for each command; link suggestions show what they open.
- Canvas background: light or dark, with dots on or off (instead of three fixed looks). Older drawings open as they were.
- Editing mode: a choice between Simple and Normal (layers and components). Normal is the default.
- The sidebar no longer shows Recent, Drawings and Knowledge map (recent work is on Home; loose drawings are reached from a drawing's breadcrumb).

### Fixed
- Table cells no longer cut their text with "…", and a table no longer squeezes its rows when resized.
- Copies of a diagram from text are independent, like gauges and charts.


## 1.4.0 — 2026-11-17

### Added
- **Note toolbar**: a text style menu (text, heading 1 to 3), bold, italic, strikethrough, inline code, bulleted, numbered and to-do lists, quote, code block, table, divider and link. Buttons light up for the formatting under the cursor and keep the cursor where it was. Shortcuts: Ctrl+Alt+0 to 3 for text and headings, Ctrl+Shift+7/8/9 for numbered, bulleted and to-do lists.
- Notes look better: link chips show whether they open a whiteboard, a board or a note, and a link to a page that does not exist yet is dashed; rounded to-do boxes; tables read as a grid; a line under the title shows the project, the last edit and the word count; slightly larger reading type.
- Aven reopens with the window size, position and maximized state it had when it was closed.

### Changed
- **Whiteboard tools**: image, frame, diagram from text, chart, table and gauge have their own buttons in the rail again (no more "+" list). Shapes, arrows and drawing tools stay grouped; their variants open beside the rail and close as soon as the pointer moves away.
- **Colour pickers**: round swatches without the separator; a colour ring opens the palette, which keeps the colours and the hex code but no longer shows shades and key hints.
- **Diagram from text**: the examples are written with dashes, a "How it works" panel explains the first line, the dash and the indentation, and Indent and Outdent buttons help. Tab and Shift+Tab indent whole lines, Enter starts the next line with the same dash, and a "- item" written under a title line is nested under it.


## 1.3.0 — 2026-11-17

### Added
- **Notes**: Markdown notes (`.md` files) next to whiteboards and boards, in projects and folders. The editor shows formatting as you write, the way Obsidian's live preview does: headings, bold, italic, strikethrough, lists, clickable to-dos, quotes, code blocks, dividers and links, with the Markdown marks visible only on the line being edited. Type `/` for commands (headings, lists, to-do, quote, code, table, divider, link), `[[` to link a whiteboard, board or note. Files stay plain Markdown, byte for byte, so Obsidian, Notion and any editor read them. Autosave, version history, conflict detection, search (Ctrl+P), trash, copy for Notion and copy to an Obsidian vault.
- **Links between documents**: a note's `[[Title]]` opens the whiteboard, board or note with that title (or offers to create the note); Kanban cards link to whiteboards, boards and notes.
- **New menu**: one "New" button creates a whiteboard, a Kanban board or a note; "Import" groups whiteboard and project imports.

### Changed
- **Simpler charts and tables**: data is edited in a small spreadsheet (label and value per row, a real grid for tables) instead of free text. Enter adds a row, arrows move between rows, cells pasted from a spreadsheet fill several rows. Unit, values and colour palettes moved to the chart's "…" menu.
- **Leaner whiteboard**: the tool rail goes from 19 buttons to 7. Shapes, arrows and lines, and drawing tools each share one button that remembers the last one used (click the active button for its variants); image, frame, diagram from text, charts and gauges sit under one Insert button. The top bar's grid and snap toggles live in the canvas menu, and the style panel no longer repeats the arrange and action buttons; it stays hidden while only a gauge or chart is selected, since their own panel handles them.
- **Shorter right-click menus**: no icons, the essentials first, rarely used commands under "More".
- Home: the quick-start tiles keep only "From a template" and "New project".
- Submenus that would not fit on the right of the window open on the left, instead of covering their own menu.

### Fixed
- Duplicating (or copy-pasting) a percentage gauge or a chart made the copy share the original's data, so editing one changed or moved the other. Each copy now gets its own identity, and drawings where this already happened are repaired when opened.


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
