# Design

## Visual theme
Dark-first desktop tool. Graphite neutrals tinted toward the brand ink (hue 280), one coral accent for primary actions, the active tool and focus. The brand's five facet colours (honey, coral, violet, blue, deep violet) appear only in the logo, project colour tags and template previews, never as UI decoration.

## Logo
"Envol": an origami bird folded from six colour facets, flying up-right. Files in `brand/final/` (built by `brand/build-envol.mjs`). Wordmark: lowercase rounded "aven" built from strokes (x-height 100, stroke 22). App icon: bird on an ink rounded tile.

| Facet | Hex |
|---|---|
| Honey (head) | #F5AE39 |
| Coral (near wing) | #F76046 |
| Coral deep (wing fold) | #C8432E |
| Violet (body) | #8E5BE8 |
| Deep violet (far wing) | #5A3BB5 |
| Blue (tail) | #567BF7 |
| Ink | #191A24 |
| Paper | #FBFAF8 |

## Colour tokens (OKLCH, see `src/styles/tokens.css`)
| Role | Dark | Light |
|---|---|---|
| bg (chrome) | 0.165 0.012 280 | 0.975 0.004 280 |
| surface (panels) | 0.200 0.013 280 | 1 0 0 |
| raised (popovers) | 0.240 0.014 280 | 0.990 0.003 280 |
| border | 0.300 0.014 280 | 0.890 0.008 280 |
| text | 0.960 0.005 280 | 0.220 0.020 280 |
| text-muted | 0.740 0.012 280 | 0.470 0.015 280 |
| accent (coral) | 0.690 0.190 32 | 0.620 0.200 32 |
| on-accent | ink | white |
| danger | 0.650 0.200 20 | 0.560 0.210 25 |
| success | 0.720 0.150 160 | 0.560 0.140 160 |

## Typography
One family: Figtree Variable (OFL, bundled offline). Fixed rem scale, ratio ~1.18: 11 / 12 / 13 (base UI) / 15 / 18 / 22 / 28. Weights 450 body, 550 labels, 650 headings. Shortcuts in `ui-monospace`.

## Layout
- Home: left sidebar (workspace switcher, library sections, projects tree) + content (search, filters, grid/list).
- Editor: top bar (back, breadcrumb title, undo/redo, save state, export), left vertical tool rail, canvas, right properties panel (contextual), optional right dock for Layers / Components / Links.
- Spacing scale 4/8/12/16/24/32/48. Radius: 6 (controls), 10 (panels), 14 (dialogs).
- z-index scale: dropdown 20, sticky 30, overlay 40, modal 50, toast 60, tooltip 70.

## Motion
150 to 220 ms, ease-out-quart. State changes only (panel open, menu reveal, toast). Reduced motion: instant.

## Components
Button (primary, secondary, ghost, danger; sm/md), IconButton with tooltip + shortcut hint, Input, Select, Switch, Segmented control, Menu (portal), Dialog (native `<dialog>`), Toast, Tooltip, Card (project), Kbd.
