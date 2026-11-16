// Every keyboard shortcut Aven knows about. "aven" commands are handled by Aven and can be
// rebound; "engine" entries are built into the canvas engine and listed for reference.
export interface ShortcutDef {
  id: string;
  label: string;
  group: "General" | "Drawings" | "Tools" | "Editing" | "Arrange" | "View" | "Panels";
  keys: string; // default binding, e.g. "Mod+Shift+E"
  kind: "aven" | "engine";
  scope?: "global" | "editor" | "home";
  /** canvas tool activated by this shortcut (rebindable tools) */
  tool?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  // General (Aven)
  { id: "app.search", label: "Search drawings, projects and commands", group: "General", keys: "Mod+P", kind: "aven", scope: "global" },
  { id: "app.shortcuts", label: "Keyboard shortcuts", group: "General", keys: "Mod+/", kind: "aven", scope: "global" },
  { id: "app.guides", label: "Setup guides: Obsidian, Notion, Google Drive", group: "General", keys: "", kind: "aven", scope: "global" },
  { id: "app.settings", label: "Open settings", group: "General", keys: "Mod+,", kind: "aven", scope: "global" },
  { id: "app.newDrawing", label: "New drawing", group: "Drawings", keys: "Mod+N", kind: "aven", scope: "global" },
  { id: "app.newBoard", label: "New Kanban board", group: "Drawings", keys: "Mod+Shift+K", kind: "aven", scope: "global" },
  { id: "app.newProject", label: "New project", group: "Drawings", keys: "Mod+Shift+N", kind: "aven", scope: "global" },
  { id: "app.templates", label: "New drawing from template", group: "Drawings", keys: "Mod+Shift+T", kind: "aven", scope: "global" },
  { id: "editor.save", label: "Save now", group: "Drawings", keys: "Mod+S", kind: "aven", scope: "editor" },
  { id: "editor.export", label: "Export", group: "Drawings", keys: "Mod+Shift+E", kind: "aven", scope: "editor" },
  { id: "editor.close", label: "Close drawing", group: "Drawings", keys: "Mod+W", kind: "aven", scope: "editor" },
  { id: "editor.panel.layers", label: "Layers panel", group: "Panels", keys: "Alt+L", kind: "aven", scope: "editor" },
  { id: "editor.panel.components", label: "Components panel", group: "Panels", keys: "Alt+C", kind: "aven", scope: "editor" },
  { id: "editor.panel.info", label: "Drawing info and links", group: "Panels", keys: "Alt+I", kind: "aven", scope: "editor" },
  { id: "editor.library", label: "Shape library", group: "Panels", keys: "Alt+B", kind: "aven", scope: "editor" },

  // Tools (rebindable: Aven intercepts the new key and activates the tool)
  { id: "tool.selection", label: "Selection", group: "Tools", keys: "V", kind: "aven", scope: "editor", tool: "selection" },
  { id: "tool.hand", label: "Hand (pan)", group: "Tools", keys: "H", kind: "aven", scope: "editor", tool: "hand" },
  { id: "tool.rectangle", label: "Rectangle", group: "Tools", keys: "R", kind: "aven", scope: "editor", tool: "rectangle" },
  { id: "tool.square", label: "Square", group: "Tools", keys: "", kind: "aven", scope: "editor", tool: "preset:square" },
  { id: "tool.rounded", label: "Rounded rectangle", group: "Tools", keys: "", kind: "aven", scope: "editor", tool: "preset:rounded" },
  { id: "tool.diamond", label: "Diamond", group: "Tools", keys: "D", kind: "aven", scope: "editor", tool: "diamond" },
  { id: "tool.ellipse", label: "Ellipse", group: "Tools", keys: "O", kind: "aven", scope: "editor", tool: "ellipse" },
  { id: "tool.circle", label: "Circle", group: "Tools", keys: "", kind: "aven", scope: "editor", tool: "preset:circle" },
  { id: "tool.arrow", label: "Arrow", group: "Tools", keys: "A", kind: "aven", scope: "editor", tool: "arrow" },
  { id: "tool.doubleArrow", label: "Double arrow", group: "Tools", keys: "", kind: "aven", scope: "editor", tool: "preset:double-arrow" },
  { id: "tool.connector", label: "Connector (elbow arrow)", group: "Tools", keys: "", kind: "aven", scope: "editor", tool: "preset:connector" },
  { id: "tool.line", label: "Line", group: "Tools", keys: "L", kind: "aven", scope: "editor", tool: "line" },
  { id: "tool.freedraw", label: "Draw", group: "Tools", keys: "P", kind: "aven", scope: "editor", tool: "freedraw" },
  { id: "tool.text", label: "Text", group: "Tools", keys: "T", kind: "aven", scope: "editor", tool: "text" },
  { id: "tool.image", label: "Insert image", group: "Tools", keys: "9", kind: "aven", scope: "editor", tool: "image" },
  { id: "tool.eraser", label: "Eraser", group: "Tools", keys: "E", kind: "aven", scope: "editor", tool: "eraser" },
  { id: "tool.laser", label: "Laser pointer", group: "Tools", keys: "K", kind: "aven", scope: "editor", tool: "laser" },
  { id: "tool.frame", label: "Frame", group: "Tools", keys: "F", kind: "aven", scope: "editor", tool: "frame" },
  { id: "text.bold", label: "Bold text", group: "Editing", keys: "Mod+B", kind: "aven", scope: "editor" },
  { id: "text.italic", label: "Italic text", group: "Editing", keys: "Mod+I", kind: "aven", scope: "editor" },
  { id: "text.underline", label: "Underline text", group: "Editing", keys: "Mod+U", kind: "aven", scope: "editor" },
  { id: "text.strike", label: "Strikethrough text", group: "Editing", keys: "", kind: "aven", scope: "editor" },
  { id: "editor.textDiagram", label: "Diagram from text", group: "Tools", keys: "Mod+Shift+D", kind: "aven", scope: "editor" },
  { id: "editor.insertGauge", label: "Insert percentage gauge", group: "Tools", keys: "", kind: "aven", scope: "editor" },
  { id: "tool.lock", label: "Keep tool active after drawing", group: "Tools", keys: "Q", kind: "engine" },

  // Editing (engine)
  { id: "edit.undo", label: "Undo", group: "Editing", keys: "Mod+Z", kind: "engine" },
  { id: "edit.redo", label: "Redo", group: "Editing", keys: "Mod+Shift+Z", kind: "engine" },
  { id: "edit.redo2", label: "Redo", group: "Editing", keys: "Mod+Y", kind: "engine" },
  { id: "edit.copy", label: "Copy", group: "Editing", keys: "Mod+C", kind: "engine" },
  { id: "edit.cut", label: "Cut", group: "Editing", keys: "Mod+X", kind: "engine" },
  { id: "edit.paste", label: "Paste", group: "Editing", keys: "Mod+V", kind: "engine" },
  { id: "edit.pastePlain", label: "Paste as plain text", group: "Editing", keys: "Mod+Shift+V", kind: "engine" },
  { id: "edit.duplicate", label: "Duplicate", group: "Editing", keys: "Mod+D", kind: "engine" },
  { id: "edit.delete", label: "Delete", group: "Editing", keys: "Delete", kind: "engine" },
  { id: "edit.selectAll", label: "Select all", group: "Editing", keys: "Mod+A", kind: "engine" },
  { id: "edit.copyStyles", label: "Copy styles", group: "Editing", keys: "Mod+Alt+C", kind: "engine" },
  { id: "edit.pasteStyles", label: "Paste styles", group: "Editing", keys: "Mod+Alt+V", kind: "engine" },
  { id: "edit.link", label: "Add or edit link", group: "Editing", keys: "Mod+K", kind: "engine" },
  { id: "edit.lock", label: "Lock or unlock selection", group: "Editing", keys: "Mod+Shift+L", kind: "engine" },
  { id: "edit.find", label: "Find on canvas", group: "Editing", keys: "Mod+F", kind: "engine" },
  { id: "edit.flipH", label: "Flip horizontal", group: "Editing", keys: "Shift+H", kind: "engine" },
  { id: "edit.flipV", label: "Flip vertical", group: "Editing", keys: "Shift+V", kind: "engine" },

  // Arrange (engine)
  { id: "arr.group", label: "Group selection", group: "Arrange", keys: "Mod+G", kind: "engine" },
  { id: "arr.ungroup", label: "Ungroup", group: "Arrange", keys: "Mod+Shift+G", kind: "engine" },
  { id: "arr.forward", label: "Bring forward", group: "Arrange", keys: "Mod+]", kind: "engine" },
  { id: "arr.backward", label: "Send backward", group: "Arrange", keys: "Mod+[", kind: "engine" },
  { id: "arr.front", label: "Bring to front", group: "Arrange", keys: "Mod+Shift+]", kind: "engine" },
  { id: "arr.back", label: "Send to back", group: "Arrange", keys: "Mod+Shift+[", kind: "engine" },
  { id: "arr.alignLeft", label: "Align left", group: "Arrange", keys: "Mod+Shift+ArrowLeft", kind: "engine" },
  { id: "arr.alignRight", label: "Align right", group: "Arrange", keys: "Mod+Shift+ArrowRight", kind: "engine" },
  { id: "arr.alignTop", label: "Align top", group: "Arrange", keys: "Mod+Shift+ArrowUp", kind: "engine" },
  { id: "arr.alignBottom", label: "Align bottom", group: "Arrange", keys: "Mod+Shift+ArrowDown", kind: "engine" },
  { id: "arr.nudge", label: "Move selection (hold Shift for 10px)", group: "Arrange", keys: "ArrowKeys", kind: "engine" },

  // View (engine)
  { id: "view.zoomIn", label: "Zoom in", group: "View", keys: "Mod+=", kind: "engine" },
  { id: "view.zoomOut", label: "Zoom out", group: "View", keys: "Mod+-", kind: "engine" },
  { id: "view.zoomReset", label: "Reset zoom", group: "View", keys: "Mod+0", kind: "engine" },
  { id: "view.fit", label: "Zoom to fit everything", group: "View", keys: "Shift+1", kind: "engine" },
  { id: "view.fitSelection", label: "Zoom to selection", group: "View", keys: "Shift+2", kind: "engine" },
  { id: "view.grid", label: "Toggle grid", group: "View", keys: "Mod+'", kind: "engine" },
  { id: "view.snap", label: "Toggle snapping to objects", group: "View", keys: "Alt+S", kind: "engine" },
  { id: "view.zen", label: "Zen mode", group: "View", keys: "Alt+Z", kind: "engine" },
  { id: "view.viewMode", label: "View mode", group: "View", keys: "Alt+R", kind: "engine" },
  { id: "view.stats", label: "Dimensions and stats", group: "View", keys: "Alt+/", kind: "engine" },
  { id: "view.pan", label: "Pan the canvas", group: "View", keys: "Space+Drag", kind: "engine" },
];

export function bindingFor(id: string, custom: Record<string, string>): string {
  if (id in custom) return custom[id];
  return SHORTCUTS.find((s) => s.id === id)?.keys ?? "";
}
