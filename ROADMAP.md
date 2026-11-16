# Roadmap

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 1. Research and architecture | Done | Toolchain inspected (Node 24, Rust 1.96 MSVC, WebView2), Excalidraw 0.18 (MIT) evaluated and chosen as the engine, architecture in ARCHITECTURE.md |
| 2. Brand and design system | Done | Logo explored over three rounds with the user; final "Envol" origami bird. "Atelier" interface: floating paper islands, dotted canvas texture, folded-corner facet accents, Bricolage Grotesque + Figtree, OKLCH tokens, dark/light/system, five accents |
| 3. Desktop foundation | Done | Tauri 2, React 19, TypeScript, Tailwind 4, Zustand, SQLite index, settings, navigation, workspace registry |
| 4. Drawing engine | Done | Engine embedded behind EditorSession; Aven tool rail, top bar, presets, autosave, recovery, conflict handling |
| 5. Project management | Done | Projects, folders, trash, archives, favorites, pins, search, thumbnails, backups, recovery, relocation |
| 6. Smart templates | Done | 40 editable built-ins, gallery, personal templates, packs |
| 7. Optional advanced editing | Done | Layers, components, linked instances, settings toggle |
| 8. Exports and integrations | Done / Partial | Files, Obsidian, Notion folder, Google Drive folder done; Notion and Drive APIs implemented but not verified live |
| 9. Final polish | In progress | Ongoing visual refinement; see TESTING.md |
| 10. Windows distribution | See TESTING.md | NSIS installer built and tested on this machine |

## Next

1. Bold / italic / underline text: requires either upstream engine support or a fork of the text renderer.
2. Vector PDF export (SVG → PDF with embedded fonts).
3. Single-instance mode: opening a `.aven` file while Aven runs should focus the existing window instead of starting a second one.
4. Code signing for the installer and an auto-updater (Tauri updater plugin with signed releases).
5. Project-to-project links UI (data model already stores them).
6. Undo/redo for layer operations.
7. Live test of Notion and Google Drive API publishing with real accounts; add a "test connection" for Drive.
8. Localisation (French first): UI strings are centralised enough to extract.
9. Optional sync-friendly conflict merge (element-level reconcile on external changes instead of whole-file choice).
