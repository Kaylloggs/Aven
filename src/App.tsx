import { lazy, Suspense, useEffect, useState } from "react";
import { useSettings } from "@/store/settings";
import { useWorkspace } from "@/store/workspace";
import { openDrawing, useUI } from "@/store/ui";
import { MenuHost } from "@/components/Menu";
import { PromptHost, Toaster, TooltipHost } from "@/components/Overlays";
import { LogoMark } from "@/components/Logo";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { HomeScreen } from "@/features/home/HomeScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { GlobalOverlays } from "@/features/overlays/GlobalOverlays";
import { useGlobalShortcuts } from "@/features/shortcuts/useGlobalShortcuts";
import { useEditor } from "@/features/editor/session";
import { useBoard } from "@/features/board/boardStore";
import { api, isDesktop } from "@/platform/api";
import { runMaintenance } from "@/features/maintenance";
import { installContextMenu } from "@/features/contextMenu";

const EditorScreen = lazy(() => import("@/features/editor/EditorScreen"));
const BoardScreen = lazy(() => import("@/features/board/BoardScreen"));

function Splash() {
  return (
    <div className="grid h-full place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4 anim-fade">
        <LogoMark size={56} />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-surface-2">
          <div className="skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

export function App() {
  const loaded = useSettings((s) => s.loaded);
  const onboardingDone = useSettings((s) => s.settings.onboardingDone);
  const active = useWorkspace((s) => s.active);
  const wsLoading = useWorkspace((s) => s.loading);
  const route = useUI((s) => s.route);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      await useSettings.getState().load();
      await useWorkspace.getState().init();
      setBooted(true);
      runMaintenance();
      const file = await api.startupFile().catch(() => null);
      if (file && useSettings.getState().settings.onboardingDone) openDrawing(file);
    })();
  }, []);

  useGlobalShortcuts();
  useEffect(() => installContextMenu(), []);

  // Flush unsaved work before the window closes.
  useEffect(() => {
    if (!isDesktop) {
      const h = (e: BeforeUnloadEvent) => {
        const s = useEditor.getState();
        if (s.session && s.saveState !== "saved") {
          void s.session.flush();
          e.preventDefault();
        }
      };
      window.addEventListener("beforeunload", h);
      return () => window.removeEventListener("beforeunload", h);
    }
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onCloseRequested(async (e) => {
        const s = useEditor.getState();
        const b = useBoard.getState();
        if (b.board && b.saveState !== "saved") {
          e.preventDefault();
          await Promise.race([b.flush(), new Promise((r) => setTimeout(r, 4000))]);
          if (!(s.session && s.saveState !== "saved")) return void (await win.destroy());
        }
        if (s.session && s.saveState !== "saved") {
          e.preventDefault();
          // save pending work, but never let a slow disk keep the window open
          await Promise.race([s.session.flush(), new Promise((r) => setTimeout(r, 4000))]);
          await win.destroy();
        }
      });
    })();
    return () => unlisten?.();
  }, []);

  if (!booted || !loaded || (active && wsLoading)) return <Splash />;

  const needsOnboarding = !active || !onboardingDone;

  return (
    <>
      {needsOnboarding ? (
        <Onboarding />
      ) : route.name === "editor" ? (
        <Suspense fallback={<Splash />}>
          <EditorScreen key={route.openId} path={route.path} />
        </Suspense>
      ) : route.name === "board" ? (
        <Suspense fallback={<Splash />}>
          <BoardScreen key={route.openId} path={route.path} />
        </Suspense>
      ) : route.name === "settings" ? (
        <SettingsScreen />
      ) : (
        <HomeScreen />
      )}
      {!needsOnboarding && <GlobalOverlays />}
      <MenuHost />
      <PromptHost />
      <Toaster />
      <TooltipHost />
    </>
  );
}
