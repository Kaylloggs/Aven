# Features

Status legend: **Done** (implemented and exercised), **Partial** (works with a documented limit), **Not supported** (engine limitation, workaround noted). "Verified" lists how it was checked: unit tests (UT), Rust tests (RT), manual run in the browser preview (UI) or in the installed desktop app (App).

## Drawing tools

| Feature | Status | Notes |
|---|---|---|
| Selection, hand/pan | Done | V / H, Space+drag |
| Rectangle, diamond, ellipse | Done | R, D, O |
| Square, circle | Done | In the Shapes button's variants; drawn shape is made regular on release (Shift also works) |
| Rounded rectangle | Done | Preset; edges can be toggled for any shape |
| Line, arrow, double arrow | Done | L, A; double arrow preset sets both arrowheads |
| Connector | Done | Elbow arrows that bind to shapes and re-route when shapes move |
| Freehand, eraser, text, image | Done | P, E, T, 9 |
| Laser pointer, frame | Done | K, F |
| Keep tool active | Done | Q, or in the variants of the Shapes, Arrows and Draw buttons |
| Tool rail | Done | Centred on the left: Select, Hand, Shapes, Arrows and lines, Draw (pen, eraser, laser), Text, Images, Link or video, Frame, Diagram from text, Chart, Table, Gauge; grouped buttons remember the last tool, their variants open beside the rail and close when the pointer leaves |
| Object bars | Done | A floating bar above the selected table, chart, gauge, diagram or text, hidden while dragging |
| Several images at once, drag and drop | Done | Grid layout, large photos scaled down (verified in the UI) |
| Links and videos | Done | YouTube, Vimeo, Figma and other supported services play in the canvas; other sites become link cards (UT for link checks) |
| Percentage gauge (bar or ring) | Done | Insert menu; select a gauge to set value, colour and style; copies are independent (UT) |

## Object manipulation

Select, multi-select, move, resize, rotate, duplicate (Ctrl+D), copy/cut/paste, delete, group/ungroup, lock/unlock, bring forward/backward/front/back, align and distribute, opacity, stroke width/style, colours, fill styles, sloppiness, edges, arrowheads, arrow type (sharp/curved/elbow): **Done** (engine). Snap to grid and smart alignment guides (object snapping): **Done**. Dimensions and position editing: **Done** via the Dimensions and stats panel (Alt+/ or Canvas menu).

## Canvas experience

Canvas looks: Dots (default, follows the interface theme and moves with pan/zoom), Off-white, Dark — per drawing, default in Settings (UT). Rotation snaps exactly upright when released within 4° of a right angle. Infinite canvas, smooth zoom (wheel, Ctrl+wheel, pinch on trackpads) and pan, zoom controls, zoom to fit/selection, background colour (presets + custom), grid on/off, grid size and major-line step, Aven right-click menus (canvas and selection; the engine's own menu and the browser menu are replaced), undo/redo, autosave, dark/light canvas independent from the UI theme, find on canvas (Ctrl+F), view mode, zen mode: **Done**.

## Text

| Feature | Status | Notes |
|---|---|---|
| Fonts | Done | Excalifont (hand-drawn), Nunito, Comic Shanns, Liberation Sans, Lilita One and more from the engine's font picker |
| Size, colour, alignment (horizontal and vertical in containers) | Done | |
| Direct editing, resizing, wrapping | Done | Text wraps inside shapes and when its width is dragged |
| Text background | Partial | Put text inside a shape (double-click a shape) and give the shape a fill; standalone text has no background of its own |
| Bold, italic, underline, strikethrough | Done | Per text element (whole text, not per word). Toolbar + Ctrl+B/I/U; canvas, PNG/PDF and SVG (UT). Not available while the text is being edited. |

## Images and assets

PNG, JPEG, SVG, WebP, GIF insertion via the tool, drag and drop or clipboard paste: **Done**. Resize, crop (double-click an image), position: **Done**. Images are embedded inside the `.aven` file so drawings stay portable: **Done** (UT).

## Advanced drawing

Frames: **Done**. Reusable shape library (engine library, saved per workspace in `Libraries/library.excalidrawlib`): **Done**. Shape links to URLs or other drawings (`aven://drawing/<id>`): **Done**. Export selection, whole canvas or individual frames: **Done**. Import `.aven` and `.excalidraw`: **Done** (UT).

## Keyboard

Engine shortcuts (undo/redo, copy/paste, duplicate, delete, group, select all, zoom, tools…): **Done**. Aven shortcuts (search Ctrl+P, new drawing Ctrl+N, new project Ctrl+Shift+N, templates Ctrl+Shift+T, save Ctrl+S, export Ctrl+Shift+E, close Ctrl+W, panels Alt+L/C/I, library Alt+B, settings Ctrl+,): **Done**. Searchable shortcut reference (Ctrl+/ or ?): **Done**. Customisable shortcuts: **Partial** — every Aven command and every tool can be given a new key with clash detection; the engine's own default keys keep working and cannot be removed.

## Charts, tables and diagrams from text

| Feature | Status | Notes |
|---|---|---|
| Bar, horizontal bar, line, pie, donut charts | Done | Editable shapes; data edited in a row editor (label, value); palettes and unit in the chart menu; re-layout after resize; copies are independent (UT) |
| Tables | Done | Double-click a cell to type; words never cut, text wraps, rows grow; header colour, stripes, lines, text size; data panel and spreadsheet paste (UT) |
| Diagram from text | Done | Indented list to mind map, org chart, plan, flow; Mermaid to shapes; legend, Indent/Outdent, Tab and Enter editing; stays one object: change layout or style, or edit the text (UT for list layouts and editing; Mermaid verified in the UI) |

## Notes

| Feature | Status | Notes |
|---|---|---|
| Notes as plain `.md` files in projects and folders | Done | RT; created from the New menu; title is the file name |
| Live Markdown (headings, emphasis, lists, to-dos, quotes, code, dividers, links) | Done | Marks shown only on the edited line; verified in the UI |
| `/` commands and `[[` links to whiteboards, boards and notes | Done | UT for link parsing and resolution; verified in the UI |
| Formatting toolbar and shortcuts (styles, lists, quote, code, table, divider, link) | Done | UT for block detection; verified in the UI |
| Link chips by document kind, missing pages dashed; word count | Done | verified in the UI |
| Autosave, version history, conflict detection, trash, search | Done | same write path as drawings (RT) |
| Copy for Notion, copy to an Obsidian vault | Done | |

## Kanban boards

| Feature | Status | Notes |
|---|---|---|
| Boards as `.avenboard` files in projects and folders, presets | Done | RT, UT |
| Columns: add, rename, colour, WIP limit, reorder (drag or menu), delete (move or drop cards) | Done | UT |
| Cards: quick add, drag between and within columns, description, checklist, due date, labels, links to drawings, delete | Done | UT |
| Filter by text and label; search across boards (Ctrl+P) | Done | |
| Autosave, version history, conflict detection, save on window close | Done | same write path as drawings |
| Export Markdown, copy for Notion, Obsidian Kanban plugin format | Done | UT |
| Card links to whiteboards, boards and notes | Done | verified in the UI |
| Right-click menus on cards, column headers and the board background | Done | verified in the UI |
| Label rename, colour and delete; colour swatches for columns and labels | Done | UT |

## Workspaces and projects

| Feature | Status | Verified |
|---|---|---|
| Workspaces in any folder, multiple workspaces, switcher | Done | RT, UI |
| Projects, nested folders, loose drawings, assets listed | Done | RT, UT, UI |
| Rename, duplicate (new ids), move (menu or drag and drop), favorite, pin, colour, description | Done | RT, UI |
| Archive / restore projects | Done | RT, UT |
| Trash with restore, permanent delete, empty, auto-purge after N days | Done | RT, UT |
| Home dashboard: recent, favorites, pinned, all projects, thumbnails, grid/list, sorting, filtering, quick creation | Done | UI |
| Search across titles and text inside drawings (Ctrl+P) | Done | RT (FTS) |
| Missing or moved workspace folder handled (locate / reconnect / remove) | Done | RT |
| Storage usage, open/copy workspace path, relocate workspace safely | Done | RT |
| Project export/import (`.avenproject` zip) | Done | RT (zip) |

## Templates

40 built-in editable templates in five categories (Planning, Thinking, Business, Design & development, Creative), gallery with previews, search, categories, recommended, recently used, favorites, personal templates, save drawing as template, customise a built-in, duplicate, delete, import/export single templates and template packs (`.aventemplates`): **Done** (UT checks all 40 build valid, editable content).

## Normal editing mode (layers and components; Settings › Editing mode, on by default)

| Feature | Status | Notes |
|---|---|---|
| Layers: create, rename, delete (with or without elements), reorder by drag, show/hide, lock/unlock, opacity, move selection to layer, select layer contents, group layers, duplicate | Done | UT for all operations; layer visibility/lock changes are not part of canvas undo history |
| Components: create from selection, personal library per workspace, reuse in any drawing, duplicate, rename, categories, import/export (`.avenlib`, `.excalidrawlib`) | Done | UT |
| Linked instances: push changes to the component, choose to update other instances (or always/never), update outdated instances, detach | Done | UT |
| Panels can be hidden and resized; Layers docks bottom-right; turning the feature off keeps the standard editor intact and shows all layers | Done | UT, UI |

## Connected drawings

Links between drawings (Info panel), shape links to drawings, backlinks ("Linked from"), copy a drawing link: **Done**. The knowledge map (graph of linked drawings) is no longer in the sidebar since 1.5.0. Links between projects: **Partial** (project metadata stores links; there is no UI to edit them yet).

## Export and integrations

| Feature | Status | Notes |
|---|---|---|
| PNG, JPEG, WebP | Done | 1x–4x or custom scale, background on/off, dark export, padding, selection/frames |
| SVG | Done | Vector; fonts inlined; optional embedded scene for re-editing |
| PDF | Partial | One page per export or per frame; pages are lossless high-resolution images (not vector). Use SVG for vector output. |
| JSON (Excalidraw-compatible), native `.aven` | Done | |
| Batch export of frames | Done | One file per frame into a chosen folder |
| Obsidian: vault detection/selection, note + attachments folders, PNG/SVG, wikilink or Markdown links, frontmatter metadata, optional `.aven` source copy, open in Obsidian | Done | UT for note generation |
| Notion-ready folder (Markdown + images for Notion Import), copy image to clipboard | Done | UT for Markdown |
| Notion direct publish (API) | Partial | Implemented (file upload + page creation, secret in Windows Credential Manager). **Not verified against a live Notion workspace.** |
| Google Drive for desktop folder export (PNG/SVG/PDF/.aven) | Done | Works offline; Drive client uploads |
| Google Drive direct upload (API, OAuth PKCE) | Partial | Implemented; requires your own Google OAuth "Desktop app" client. **Not verified against a live Google account.** |
| Clipboard copy | Done | Engine copy (Ctrl+C / Shift+Alt+C as PNG) and Notion tab "Copy image" |

## Setup guides

In-app "Connect your tools" guides for Obsidian, Notion and Google Drive with live status (detected vaults, detected Drive folder, connection state) and shortcuts to the right settings and export tabs: **Done**.

## Brand and interface

Original "Envol" origami-bird identity (symbol, wordmark, lockups, light/dark/mono, ICO/PNG/SVG, app icon, installer art), "Atelier" interface design (floating paper islands, dotted canvas texture, folded-corner accents in facet colours, Bricolage Grotesque display type with Figtree for UI), dark (default), light and system themes, five accent colours, density setting, onboarding, splash, About: **Done**.

## Data safety

Atomic writes, refusal to save invalid data, conflict detection, version history with rotation, crash recovery, corruption recovery screen, trash, scheduled workspace backups with rotation and restore-as-new: **Done** (RT for each mechanism).

## Distribution

Windows NSIS installer (per user, no admin), Start menu entry, `.aven` file association, uninstaller, WebView2 bootstrapper: see TESTING.md for verification status. No auto-updater (install a newer version over the old one; data is preserved). Installer is unsigned.

## Known limitations

- Text styles apply to a whole text element (no mixed styles inside one text).
- Kanban cards are reordered with the mouse; keyboard reordering is not available yet (use the Column selector in card details).
- PDF pages are raster images.
- Notion and Google Drive API paths have not been tested against live accounts.
- Engine default shortcuts cannot be unbound.
- Canvas selection colour follows the engine's default (violet).
- Layer visibility, lock and order changes are not undoable with Ctrl+Z (they are saved and versioned like any other change).
- Dark canvas inverts colours on screen (engine behaviour); exports keep true colours.
