// One right-click behaviour for the whole app: Aven menus everywhere, never the browser's.
// Components with their own menu (cards, projects, layers...) handle the event first and stop it;
// what reaches the window is a text field, the canvas, or a spot with nothing to offer.
import { ClipboardPaste, Copy, Scissors, TextSelect, Undo2 } from "lucide-react";
import { openContextMenu, type MenuItem } from "@/components/Menu";
import { toast } from "@/store/ui";

type Field = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUTS = new Set(["text", "search", "url", "email", "tel", "password", "number", ""]);

function textField(t: HTMLElement): Field | null {
  if (t instanceof HTMLTextAreaElement) return t;
  if (t instanceof HTMLInputElement && TEXT_INPUTS.has(t.type)) return t;
  return null;
}

/** Selection range when the input type exposes one (number and email inputs do not). */
function range(f: Field): [number, number] | null {
  try {
    return f.selectionStart === null || f.selectionEnd === null ? null : [f.selectionStart, f.selectionEnd];
  } catch {
    return null;
  }
}

function textFieldMenu(f: Field): MenuItem[] {
  const sel = range(f);
  const hasSelection = sel ? sel[1] > sel[0] : false;
  const editable = !f.readOnly && !f.disabled;
  const secret = f instanceof HTMLInputElement && f.type === "password";
  const restore = () => {
    f.focus({ preventScroll: true });
    if (sel) f.setSelectionRange(sel[0], sel[1]);
  };
  return [
    { label: "Undo", icon: <Undo2 className="size-4" />, shortcut: "Mod+Z", disabled: !editable, onSelect: () => (restore(), document.execCommand("undo")) },
    "separator",
    { label: "Cut", icon: <Scissors className="size-4" />, shortcut: "Mod+X", disabled: !editable || !hasSelection || secret, onSelect: () => (restore(), document.execCommand("cut")) },
    { label: "Copy", icon: <Copy className="size-4" />, shortcut: "Mod+C", disabled: !hasSelection || secret, onSelect: () => (restore(), document.execCommand("copy")) },
    {
      label: "Paste",
      icon: <ClipboardPaste className="size-4" />,
      shortcut: "Mod+V",
      disabled: !editable,
      onSelect: async () => {
        let text: string;
        try {
          text = await navigator.clipboard.readText();
        } catch {
          restore();
          toast({ kind: "info", title: "Press Ctrl+V to paste", message: "The clipboard could not be read from the menu." });
          return;
        }
        restore();
        // insertText keeps the field's undo history and notifies React like typing does.
        document.execCommand("insertText", false, text);
      },
    },
    "separator",
    { label: "Select all", icon: <TextSelect className="size-4" />, shortcut: "Mod+A", onSelect: () => (f.focus({ preventScroll: true }), f.select()) },
  ];
}

export function installContextMenu(): () => void {
  const onMenu = (e: MouseEvent) => {
    if (import.meta.env.DEV && e.shiftKey) return; // Shift+right-click keeps the inspector during development
    const t = e.target instanceof HTMLElement ? e.target : null;
    const field = t && textField(t);
    if (field) return openContextMenu(e, textFieldMenu(field));
    e.preventDefault();
    if (t?.closest(".excalidraw")) {
      const { clientX, clientY } = e;
      // The engine selects what was clicked during this event; read the result once it settled.
      // The editor chunk is already loaded whenever a canvas is on screen.
      requestAnimationFrame(() => void import("@/features/editor/canvasMenu").then((m) => m.showCanvasMenu(clientX, clientY)));
    }
  };
  window.addEventListener("contextmenu", onMenu);
  return () => window.removeEventListener("contextmenu", onMenu);
}
