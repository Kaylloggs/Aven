import { useEffect, useState } from "react";
import { Modal } from "@/components/Overlays";
import { LogoMark, Wordmark } from "@/components/Logo";
import { api, openExternal } from "@/platform/api";
import { useUI } from "@/store/ui";

export function AboutDialog() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    api.appPaths().then((p) => setVersion(p.version)).catch(() => {});
  }, []);
  return (
    <Modal open onClose={() => useUI.getState().setOverlay(null)} width={440} bare>
      <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
        <LogoMark size={72} />
        <Wordmark className="mt-4 h-7 w-auto text-text" />
        <p className="mt-2 text-sm text-muted">Version {version}</p>
        <p className="mt-4 max-w-[36ch] text-sm text-muted">A local-first workspace for visual thinking. Your drawings stay on your computer, in folders you choose.</p>
        <div className="mt-6 w-full rounded-lg border border-border bg-surface-2 p-4 text-left text-xs text-muted space-y-1.5">
          <p>
            Drawing engine:{" "}
            <button className="text-accent-text hover:underline cursor-pointer" onClick={() => openExternal("https://github.com/excalidraw/excalidraw")}>
              Excalidraw
            </button>{" "}
            (MIT License, © Excalidraw contributors).
          </p>
          <p>Desktop runtime: Tauri (MIT / Apache-2.0). Interface font: Figtree (SIL Open Font License). Icons: Lucide (ISC).</p>
          <p>Full license texts are in the THIRD_PARTY_NOTICES file installed with Aven.</p>
        </div>
      </div>
    </Modal>
  );
}
