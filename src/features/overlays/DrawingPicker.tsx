import { useMemo, useState } from "react";
import { FileText, Kanban, NotebookText, Search } from "lucide-react";
import { Modal } from "@/components/Overlays";
import { Input } from "@/components/ui";
import { allDocuments, useWorkspace, type DocKind, type DrawingRef } from "@/store/workspace";
import { timeAgo } from "@/lib/utils";

const ICON: Record<DocKind, React.ReactNode> = {
  drawing: <FileText className="size-4 text-faint" />,
  board: <Kanban className="size-4 text-faint" />,
  note: <NotebookText className="size-4 text-faint" />,
};
const KIND: Record<DocKind, string> = { drawing: "Whiteboard", board: "Board", note: "Note" };

/** Pick a drawing (or, with `kinds`, any whiteboard, board or note) of the workspace. */
export function DrawingPicker({
  open,
  title,
  kinds = ["drawing"],
  exclude = [],
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  kinds?: DocKind[];
  /** ids or paths to leave out */
  exclude?: string[];
  onPick: (d: DrawingRef & { kind: DocKind }) => void;
  onClose: () => void;
}) {
  const tree = useWorkspace((s) => s.tree);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const several = kinds.length > 1;
  const noun = several ? "documents" : kinds[0] === "board" ? "boards" : kinds[0] === "note" ? "notes" : "drawings";
  const list = useMemo(() => {
    const skip = new Set(exclude.map((x) => x.toLowerCase()));
    const all = allDocuments(tree).filter((d) => kinds.includes(d.kind) && !skip.has(d.id.toLowerCase()) && !skip.has(d.path.toLowerCase()));
    const t = q.toLowerCase().trim();
    return (t ? all.filter((d) => `${d.title} ${d.project?.meta.name ?? ""}`.toLowerCase().includes(t)) : all).sort((a, b) => b.updated - a.updated).slice(0, 60);
  }, [tree, q, exclude, kinds]);
  return (
    <Modal open={open} onClose={onClose} title={title} width={520}>
      <Input
        autoFocus
        icon={<Search className="size-3.5" />}
        placeholder={`Search ${noun}`}
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
        aria-label={`Search ${noun}`}
      />
      <ul className="mt-3 max-h-[50vh] overflow-auto" role="listbox">
        {list.map((d, i) => (
          <li key={d.path} role="option" aria-selected={i === active}>
            <button
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left cursor-pointer ${i === active ? "bg-hover" : "hover:bg-hover"}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(d)}
            >
              {ICON[d.kind]}
              <span className="flex-1 truncate text-sm">{d.title}</span>
              <span className="truncate text-xs text-faint">
                {several ? `${KIND[d.kind]} · ` : ""}
                {d.project?.meta.name ?? "Drawings"}
              </span>
              <span className="text-xs text-faint">{timeAgo(d.updated)}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-8 text-center text-sm text-muted">No {noun} match.</li>}
      </ul>
    </Modal>
  );
}
