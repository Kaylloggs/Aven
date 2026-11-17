# Testing

## Automated tests

### Rust backend (`cd src-tauri && cargo test`) — 18 tests, all passing

| Area | Tests |
|---|---|
| File safety (`fsops`) | atomic write replaces content and leaves no temp files; Windows-safe names; unique names; copy/move never overwrites |
| Workspace (`workspace`) | folder structure; project creation; scan of nested folders; damaged files still listed; header cache; trash/restore/purge with retention; refusal to trash outside the workspace; duplicate assigns new ids; archive round trip; rename (incl. case-only); move into itself refused |
| Saving and versions | first save makes no backup; rotation keeps N newest; invalid JSON is refused and the old file kept; conflict detected when the file changed on disk; corrupt vs missing files reported distinctly |
| Backups (`backup`) | workspace snapshot zip, rotation, restore into a new folder, caches excluded, restore never overwrites, backup folder inside workspace content refused; recovery files write/list/read/clear |
| Index (`db`) | FTS prefix and accent-insensitive search, re-index replaces entries, unsafe queries; recents and path re-pointing after moves; links and backlinks |
| Integrations | Obsidian vault detection from `obsidian.json`; PKCE challenge format |
| Notes | `.md` files listed as notes (not assets), read and saved as plain text (an empty new note opens) with `.md` backups, invalid JSON still refused for drawings, duplicated byte for byte, trashed as notes |

### Frontend (`npm test`, Vitest + jsdom) — 79 tests, all passing

| Area | Tests |
|---|---|
| Document format | round trip; pruning of deleted elements and unused images; legacy migration; refusal of newer formats; damaged/foreign file messages; Excalidraw import/export; text extraction; link extraction |
| Element helpers | clone with remapped ids (groups, bound text, bindings); bounds with linear points; version bumps |
| Layers | default layer; new elements on the active layer; hide/show/lock/opacity; user locks preserved; ordering and reordering; delete with/without elements; duplicate; select; group cascade; flatten when advanced editing is off |
| Components | normalisation; instances; push changes with/without updating others; outdated detection; detach; Aven and Excalidraw library parsing; merge |
| PDF writer | valid header/trailer, every xref offset points to its object, multi-page |
| Obsidian / Notion Markdown | safe names; filename patterns; YAML frontmatter; wikilink and encoded relative links; Notion Markdown; Notion page id parsing |
| Utilities and settings | Windows paths; relative links; sizes; shortcut labels; settings defaults merge |
| Templates and shortcuts | 40 templates, 8 per category, unique ids; every template builds elements with valid arrow/frame references; no default shortcut clashes |
| Gauges and canvas styles | bar/ring creation, layout from the track's current size, clamping, multi-gauge updates, restyle in place, ring geometry; style mapping, inference for old drawings, export background, dot spacing, persistence |
| Kanban boards | presets, card and column operations, labels, file round trip and repair of broken files, due status, Markdown and Obsidian Kanban export, search text |
| Charts and tables | data on the box, rebuild from data and after resize, all six kinds, closed pie slices, row and table parsing |
| Text styles | targets (texts and labels), toggle on/off, underline and strike geometry |
| Diagrams from text | outline parsing (bullets, spaces, tabs), every layout with valid arrow bindings, Mermaid detection |
| Duplicated gauges and charts | a copy gets its own id and its parts go back on its own track; charts keep box and parts per copy; scenes without copies untouched |
| Note links | `[[link]]`, alias and heading forms; closest-title resolution; stable backup keys |
| Note formatting | block kind of a line, word count without Markdown marks |
| Tables and backgrounds | words never cut and the table widens, long text wraps and the row grows, cell under a point; light/dark tone with dots and older values; link checks for embeds |
| Diagram text editing | dash lines nest under a title, whole-line indent and outdent, Enter continues dashes and numbers and ends an empty item |
| Workspace flows (browser backend) | create project, drawing, folder; move; trash and restore; archive |

## Manual testing done

In the browser preview (UI with the in-memory backend):
- Onboarding → create workspace → home dashboard.
- Template gallery (previews, detail view) → create drawing from the mind map template → editor opens fitted to content; arrows meet shape edges.
- Editor: tool rail drives the canvas tools, properties panel themed, autosave status changes to "Saved", back to home shows the thumbnail in "Recently opened".
- Advanced editing toggled on: Layers and Components buttons appear; Layers empty state.
- Found and fixed: session disposed by React's dev double mount; first load marked as an edit; template arrows drawn through labels; drawings not fitted on open; tool rail overlapping zoom controls.

In the installed desktop app: see "Installer verification" below.

## Installer verification (2026-11-16, Windows 11 Pro 10.0.26300)

`npm run app:build` → `Aven_1.0.0_x64-setup.exe` (17.7 MB). Desktop control was not available, so the installed app was driven through WebView2's DevTools protocol (DOM events and backend calls, no OS input), with a throwaway workspace.

| Check | Result |
|---|---|
| Silent per-user install (`/S`), no admin | PASS: `%LOCALAPPDATA%\Aven\aven.exe`, `uninstall.exe`, `THIRD_PARTY_NOTICES.md` |
| Start menu shortcut and Apps & features entry (name, version, uninstall string) | PASS |
| App starts from the install folder without Node, Rust or Vite | PASS: window title "Aven", onboarding shown on first launch |
| Workspace in a custom folder, project, drawing create / atomic save / reload | PASS |
| Workspace scan, SQLite full-text search | PASS |
| Version history backup written on overwrite | PASS (`.aven/backups/<id>/…`) |
| Workspace backup zip, trash and restore | PASS |
| Obsidian vault detection, Google Drive for desktop detection (`G:\Mon Drive`) | PASS |
| Engine fonts served offline from the bundle | PASS (HTTP 200) |
| UI: home → template gallery → Mind map → editor renders the canvas, autosave "Saved" | PASS (screenshot captured from the installed app) |
| Thumbnail generated when a drawing is opened | PASS (`.aven/thumbs/<id>.png`, 40 KB) |
| Export to an Obsidian vault from the Export dialog | PASS: note with frontmatter + `![[wikilink]]`, 272 KB PNG rendered by the engine, `.aven` source copy |
| Silent uninstall | PASS: program, shortcut and registry entry removed |
| User data kept after uninstall | PASS: `%APPDATA%pp.aven.desktop` (settings, workspace list, index) and workspace files untouched |
| Install a new build over existing data (update scenario) | PASS: workspace and drawing created with the previous install are listed on the home screen after reinstalling |

Not verified on this machine: the native save dialogs of the File export tab (they would require user interaction), PDF/SVG files written through those dialogs (the same rendering paths are exercised by the Obsidian export and unit tests), Notion and Google Drive APIs with live accounts.

## 1.1.0 regression checks (installed app, 2026-11-16)

| Check | Result |
|---|---|
| Installs over 1.0.0, registered version 1.1.0 | PASS |
| Window close request (same path as the title-bar X) closes the app | PASS |
| Close while a change is unsaved ("Saving soon") saves it first | PASS: both gauges present in the file after closing |
| Enter in the "New drawing" name prompt creates and opens the drawing | PASS |
| New drawings use the dotted canvas | PASS |
| Gauge insert + gauge controls | PASS |
| Layers panel docked bottom-right | PASS |
| Existing user workspace still shown after reinstall | PASS |

Test hygiene: these checks run against the real `%APPDATA%pp.aven.desktop`. Back it up before and restore it after any scripted test once a real workspace exists.

## 1.2.0 checks (installed app, 2026-11-16; settings folder backed up and restored)

| Check | Result |
|---|---|
| Version 1.2.0 installed over 1.1.0 | PASS |
| Kanban tile → preset menu → board opens with To do / In progress / Done and 3 sample cards | PASS |
| Card details: add a checklist item → autosaved to the `.avenboard` file, progress shown on the card | PASS |
| Home lists the board in "Boards" | PASS |
| Diagram from text (mind map) inserted, text style toolbar appears | PASS |
| Bold applied to 12 labels, saved with valid geometry | PASS |
| Bar chart inserted, chart panel shown, data saved on the chart box | PASS |
| SVG export (Obsidian tab) carries `font-weight="bold"` | PASS |
| Window close request closes the app | PASS |

## 1.2.1 checks (dev build in headless Chrome with real mouse events, mock backend, 2026-11-16)

| Check | Result |
|---|---|
| Hovered Kanban card stays inside its column (top 121 px, list top 117 px) | PASS |
| Card right-click: Open, Rename, Move to, Labels, Delete card | PASS |
| Column header right-click; column colours shown as 7 swatches, no hex codes; picking one recolours the column | PASS |
| Board background right-click: Add column | PASS |
| Text field right-click: Undo, Cut, Copy, Paste, Select all | PASS |
| Card details: new-label colour picker; label right-click menu opens inside the dialog and a swatch click recolours the label | PASS |
| Project right-click shows 6 project colour swatches | PASS |
| Empty canvas right-click shows Aven's menu, the engine menu stays hidden; Select all selects the drawing | PASS |
| Shape right-click selects it and shows Aven's menu; Duplicate, Lock/Unlock and Delete act on the selection | PASS |
| Plain interface right-click: browser menu suppressed | PASS |

## 1.5.0 checks (dev build in headless Chrome, real mouse and keyboard events, mock backend, 2026-11-17)

30 new checks plus the 28 of 1.4.0 and the 41 of 1.3.0, all passing:

| Area | Checks |
|---|---|
| Home and settings | no Recent, Drawings or Knowledge map in the sidebar; editing mode Simple / Normal with Normal on by default |
| Whiteboard | tool bar centred vertically; background menu Light / Dark / Dots; light with dots, then dots off keeps the light sheet |
| Images and links | three dropped images all inserted side by side; Images button; a YouTube link becomes an embedded video; another site becomes a link card |
| Tables | tools float above the table; data panel closed by default; header colour, stripes and text size apply; double-click opens a cell, Enter saves and moves down; long text wraps and the table grows; no cut text |
| Charts, gauges | chart tools above the chart with its data panel open; Data closes it; gauge controls float |
| Diagrams | inserted diagram is one object with its bar; changing the layout redraws it in place; Edit text reopens the dialog with its text; a duplicate gets its own identity |
| Notes | toolbar vertical on the left and centred; "/" menu with sections, icons and descriptions |

## 1.4.0 checks (dev build in headless Chrome, real mouse and keyboard events, mock backend, 2026-11-17)

28 new checks plus the 41 checks of 1.3.0, all passing on two consecutive runs:

| Area | Checks |
|---|---|
| Diagram from text | example written with dashes; legend explains first line, dash and indentation (shown as dots); Enter repeats the dash; Tab indents the whole line; Enter on an empty item ends it; the preview builds from the typed outline |
| Tool rail | 12 direct buttons; right-click on a grouped tool opens its variants beside the rail; the menu stays while the pointer is on it and closes when it leaves; Table button inserts a table |
| Colour picker | round swatches; separator hidden; the palette opens without shades or key hints |
| Note toolbar | 13 controls; Bold lights up inside bold text and removes the marks; Italic wraps a selection; text style menu sets Heading 2 and follows the cursor; To-do toggles on and off; Ctrl+Alt+1 makes a heading; link chips know their kind and mark missing pages; Table inserts a Markdown table; Link opens the picker; word count shown |

The window size and maximized state are handled by the Tauri window-state plugin; this needs the desktop app and was not checked in the browser build.

## 1.3.0 checks (dev build in headless Chrome, real mouse and keyboard events, mock backend, 2026-11-17)

41 checks, all passing on two consecutive runs (the browser backend now refuses non-JSON drawings like the native one, so notes are read through the same rule):

| Area | Checks |
|---|---|
| Home | only "From a template" and "New project" tiles; New menu (Whiteboard, Kanban board, Note) with no submenu, Note reachable after hovering every item; Import menu (whiteboards, project); a submenu at the right edge opens on the left |
| Notes | title selected on a new note, renaming the `.md` file; heading, checkbox, hidden bold marks, `[[link]]` chip; `/` commands; `[[` lists documents; checkbox click toggles `[x]`; saved as plain Markdown; text right-click menu; clicking `[[Roadmap]]` opens the whiteboard |
| Whiteboard | 7 rail buttons; no grid/snap buttons in the top bar; Shapes button picks the rectangle, second click lists variants, Ellipse switches tool; Insert menu content |
| Gauges | duplicate (Ctrl+D) gets its own id; editing the copy leaves the original at its value; each label stays on its gauge |
| Charts | one row per bar; typing a value updates the chart; Enter on the last row adds and focuses a row; table grid; adding a column widens every row |
| Menus | short empty-canvas menu; element menu with More; no icon column |
| Style panel | hidden when only a gauge is selected, shown for a rectangle (separate check) |
| Kanban | card picker lists whiteboards and notes; the card shows the linked note; opening it opens the note; home lists notes |

## Manual test plan (release checklist)

1. Fresh install → onboarding → create workspace in a custom folder (another drive).
2. Create project, folder, subfolder; create drawings from blank and from three templates.
3. Draw every tool; insert PNG, JPEG, SVG and WebP by drag and drop and by paste; crop an image.
4. Close and reopen: content, view position and thumbnails are back.
5. Kill the process while unsaved (autosave off) → reopen → restore prompt.
6. Edit the `.aven` file in a text editor while open → save in Aven → conflict banner.
7. Corrupt a file → open → restore from version history.
8. Trash a project → restore → empty trash.
9. Archive/restore a project; move a drawing by drag and drop.
10. Search for text that only appears inside a drawing.
11. Enable advanced editing: layers (hide/lock/opacity/reorder/group), components (create, insert in another drawing, push changes, update instances, detach). Disable advanced editing: everything visible, editor unchanged.
12. Export PNG 4x transparent, SVG, PDF of three frames, JPEG, WebP, JSON, `.aven`.
13. Export to an Obsidian vault with wikilinks and with Markdown links; open the note in Obsidian.
14. Export a Notion-ready folder and import it in Notion.
15. Export to the Google Drive for desktop folder.
16. Workspace backup now → restore as a new workspace.
17. Move the workspace to another folder from Settings.
18. Light theme, system theme, accent colours, compact density.
19. Install a newer build over the old one: workspaces, settings and backups preserved.
20. Uninstall: program removed, workspace folders untouched.

## Known issues

See "Known limitations" in FEATURES.md.
