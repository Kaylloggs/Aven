import { useEffect } from "react";
import { useSettings } from "@/store/settings";
import { toast, useUI } from "@/store/ui";
import { useBoard } from "@/features/board/boardStore";
import { useEditor } from "@/features/editor/session";
import { eventToShortcut, isTypingTarget } from "@/lib/utils";
import { SHORTCUTS, bindingFor } from "./registry";
import { commands } from "@/features/commands";

/** Aven-level shortcuts. Registered in the capture phase so they win over the canvas engine. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = eventToShortcut(e);
      const custom = useSettings.getState().settings.editor.shortcuts;
      const route = useUI.getState().route;
      const inEditor = route.name === "editor" && !!useEditor.getState().session;
      const typing = isTypingTarget(e.target);
      if (useUI.getState().prompt) return;

      // boards: save and close
      if (route.name === "board" && (combo === "Mod+S" || combo === "Mod+W")) {
        e.preventDefault();
        e.stopPropagation();
        const b = useBoard.getState();
        if (combo === "Mod+S") void b.save(true).then((ok) => ok && toast({ kind: "success", title: "Saved", duration: 1500 }));
        else void b.close().then(() => useUI.getState().back());
        return;
      }

      // "?" opens Aven's shortcut reference instead of the engine's help dialog
      if (inEditor && !typing && e.key === "?" && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        useUI.getState().setOverlay({ kind: "shortcuts" });
        return;
      }

      for (const s of SHORTCUTS) {
        if (s.kind !== "aven") continue;
        const keys = bindingFor(s.id, custom);
        if (!keys || keys !== combo) continue;
        if (s.scope === "editor" && !inEditor) continue;
        if (s.scope === "home" && route.name !== "home") continue;
        const plainKey = !keys.includes("Mod") && !keys.includes("Alt");
        if (plainKey && typing) continue;
        // default single-key tool bindings are handled by the engine itself
        if (s.tool && keys === s.keys && !s.tool.startsWith("preset:")) continue;
        if (useUI.getState().overlay && s.scope !== "global") continue;
        // a command returning false did not apply (e.g. no text selected): let the key through
        if (commands.run(s.id) === false) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
