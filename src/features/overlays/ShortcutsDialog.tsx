import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Button, Input } from "@/components/ui";
import { useSettings } from "@/store/settings";
import { useUI } from "@/store/ui";
import { shortcutLabel } from "@/lib/utils";
import { SHORTCUTS, bindingFor, type ShortcutDef } from "@/features/shortcuts/registry";

const GROUPS: ShortcutDef["group"][] = ["General", "Drawings", "Tools", "Editing", "Arrange", "View", "Panels"];

export function ShortcutsDialog() {
  const close = () => useUI.getState().setOverlay(null);
  const custom = useSettings((s) => s.settings.editor.shortcuts);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.toLowerCase();
    return SHORTCUTS.filter((s) => !t || s.label.toLowerCase().includes(t) || bindingFor(s.id, custom).toLowerCase().includes(t) || s.group.toLowerCase().includes(t));
  }, [q, custom]);
  return (
    <Modal
      open
      onClose={close}
      title="Keyboard shortcuts"
      width={760}
      footer={
        <Button
          variant="ghost"
          onClick={() => {
            close();
            useUI.getState().navigate({ name: "settings", tab: "shortcuts" });
          }}
        >
          Customize shortcuts
        </Button>
      }
    >
      <Input autoFocus icon={<Search className="size-3.5" />} placeholder="Search shortcuts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shortcuts" />
      <div className="mt-4 columns-2 gap-8">
        {GROUPS.map((g) => {
          const items = list.filter((s) => s.group === g && bindingFor(s.id, custom));
          if (!items.length) return null;
          return (
            <section key={g} className="mb-5 break-inside-avoid">
              <h3 className="mb-1.5 text-xs font-[650] text-faint">{g}</h3>
              <ul>
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-1 text-sm">
                    <span className="text-muted">{s.label}</span>
                    <span className="kbd">{shortcutLabel(bindingFor(s.id, custom))}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {!list.length && <p className="py-8 text-center text-sm text-muted">No shortcut matches “{q}”.</p>}
    </Modal>
  );
}
