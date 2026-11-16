import { useUI } from "@/store/ui";
import { ExportDialog } from "@/features/export/ExportDialog";
import { TemplateGallery } from "@/features/templates/TemplateGallery";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { AboutDialog } from "./AboutDialog";
import { IntegrationGuides } from "./IntegrationGuides";
import { TextDiagramDialog } from "@/features/editor/TextDiagramDialog";

export function GlobalOverlays() {
  const overlay = useUI((s) => s.overlay);
  if (!overlay) return null;
  switch (overlay.kind) {
    case "palette":
      return <CommandPalette />;
    case "shortcuts":
      return <ShortcutsDialog />;
    case "templates":
      return <TemplateGallery targetDir={overlay.targetDir} />;
    case "export":
      return <ExportDialog tab={overlay.tab} path={overlay.path} />;
    case "about":
      return <AboutDialog />;
    case "guides":
      return <IntegrationGuides initial={overlay.tab} />;
    case "textDiagram":
      return <TextDiagramDialog />;
  }
}
