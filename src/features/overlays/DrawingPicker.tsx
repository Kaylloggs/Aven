import { useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Input } from "@/components/ui";
import { allDrawings, useWorkspace, type DrawingRef } from "@/store/workspace";
import { timeAgo } from "@/lib/utils";

export function DrawingPicker({
  open,
  title,
  exclude = [],
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  exclude?: string[];
  onPick: (d: DrawingRef) => void;
  onClose: () => void;
}) {
  const tree = useWorkspace((s) => s.tree);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const all = allDrawings(tree).filter((d) => !exclude.includes(d.id));
    const t = q.toLowerCase().trim();
    return (t ? all.filter((d) => `${d.title} ${d.project?.meta.name ?? ""}`.toLowerCase().includes(t)) : all).sort((a, b) => b.updated - a.updated).slice(0, 60);
  }, [tree, q, exclude]);
  return (
    <Modal open={open} onClose={onClose} title={title} width={520}>
      <Input
        autoFocus
        icon={<Search className="size-3.5" />}
        placeholder="Search drawings"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(list.length - 1, a + 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
          if (e.key === "Enter" && list[active]) onPick(list[active]);
          e.stopPropagation();
        }}
        aria-label="Search drawings"
      />
      <ul className="mt-3 max-h-[50vh] overflow-auto" role="listbox">
        {list.map((d, i) => (
          <li key={d.path} role="option" aria-selected={i === active}>
            <button
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left cursor-pointer ${i === active ? "bg-hover" : "hover:bg-hover"}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(d)}
            >
              <FileText className="size-4 text-faint" />
              <span className="flex-1 truncate text-sm">{d.title}</span>
              <span className="truncate text-xs text-faint">{d.project?.meta.name ?? "Drawings"}</span>
              <span className="text-xs text-faint">{timeAgo(d.updated)}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-8 text-center text-sm text-muted">No drawings match.</li>}
      </ul>
    </Modal>
  );
}
