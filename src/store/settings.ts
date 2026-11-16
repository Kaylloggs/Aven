import { create } from "zustand";
import { api } from "@/platform/api";
import { debounce } from "@/lib/utils";

export type ThemePref = "dark" | "light" | "system";
export type Accent = "coral" | "honey" | "violet" | "blue" | "green";

export interface Settings {
  version: 1;
  onboardingDone: boolean;
  appearance: {
    theme: ThemePref;
    accent: Accent;
    density: "comfortable" | "compact";
    /** default look of new drawings */
    canvasStyle: "dots" | "paper" | "dark";
    /** @deprecated kept for old settings files */
    canvasTheme?: "app" | "light" | "dark";
    /** @deprecated kept for old settings files */
    canvasBackground?: string;
    showGrid: boolean;
    gridSize: number;
    gridStep: number;
    homeView: "grid" | "list";
  };
  workspace: {
    autosave: boolean;
    autosaveDelaySec: number;
    backups: { enabled: boolean; minIntervalMin: number; keep: number };
    snapshots: { frequency: "off" | "daily" | "weekly"; destination: string | null; keep: number; lastRunAt: number };
    trashRetentionDays: number;
    reopenLastDrawing: boolean;
  };
  editor: {
    defaultStrokeColor: string;
    defaultBackgroundColor: string;
    defaultStrokeWidth: number;
    defaultRoughness: number;
    defaultFontFamily: number;
    objectSnapping: boolean;
    defaultTool: "selection" | "freedraw" | "rectangle" | "text" | "hand";
    shortcuts: Record<string, string>;
  };
  advanced: {
    enabled: boolean;
    layers: boolean;
    components: boolean;
    instanceUpdates: "ask" | "always" | "never";
  };
  export: {
    defaultFormat: "png" | "svg" | "pdf" | "jpeg" | "webp";
    defaultScale: number;
    background: boolean;
    padding: number;
    filenamePattern: "{title}" | "{project} - {title}" | "{title} {date}";
    lastFolder: string | null;
    obsidian: {
      vaultPath: string | null;
      folder: string;
      attachmentsFolder: string;
      imageFormat: "png" | "svg";
      linkStyle: "wikilink" | "markdown";
      frontmatter: boolean;
      includeSource: boolean;
    };
    notion: { parentPageId: string; folder: string | null };
    gdrive: { mode: "folder" | "api"; folder: string | null; apiFolderName: string; clientId: string; clientSecret: string };
  };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboardingDone: false,
  appearance: {
    theme: "dark",
    accent: "coral",
    density: "comfortable",
    canvasStyle: "dots",
    showGrid: false,
    gridSize: 20,
    gridStep: 5,
    homeView: "grid",
  },
  workspace: {
    autosave: true,
    autosaveDelaySec: 1.5,
    backups: { enabled: true, minIntervalMin: 10, keep: 20 },
    snapshots: { frequency: "weekly", destination: null, keep: 5, lastRunAt: 0 },
    trashRetentionDays: 30,
    reopenLastDrawing: false,
  },
  editor: {
    defaultStrokeColor: "#1e1e1e",
    defaultBackgroundColor: "transparent",
    defaultStrokeWidth: 2,
    defaultRoughness: 1,
    defaultFontFamily: 5,
    objectSnapping: true,
    defaultTool: "selection",
    shortcuts: {},
  },
  advanced: { enabled: false, layers: true, components: true, instanceUpdates: "ask" },
  export: {
    defaultFormat: "png",
    defaultScale: 2,
    background: true,
    padding: 24,
    filenamePattern: "{title}",
    lastFolder: null,
    obsidian: {
      vaultPath: null,
      folder: "Aven",
      attachmentsFolder: "Aven/Attachments",
      imageFormat: "png",
      linkStyle: "wikilink",
      frontmatter: true,
      includeSource: false,
    },
    notion: { parentPageId: "", folder: null },
    gdrive: { mode: "folder", folder: null, apiFolderName: "Aven", clientId: "", clientSecret: "" },
  },
};

function deepMerge<T>(base: T, over: any): T {
  if (!over || typeof over !== "object" || Array.isArray(over)) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as any)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? deepMerge(b, v) : v;
  }
  return out;
}

/** Fill in defaults for missing keys (old or partial settings files). */
export function normalizeSettings(raw: unknown): Settings {
  return deepMerge(DEFAULT_SETTINGS, raw);
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: DeepPartial<Settings>) => void;
  reset: () => void;
}

const persist = debounce((s: Settings) => {
  api.settingsSave(s).catch((e) => console.error("settings save failed", e));
}, 300);

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const raw = await api.settingsLoad().catch(() => null);
    const settings = normalizeSettings(raw);
    set({ settings, loaded: true });
    applyAppearance(settings);
  },
  update: (patch) => {
    const settings = deepMerge(get().settings, patch);
    set({ settings });
    applyAppearance(settings);
    persist(settings);
  },
  reset: () => {
    const settings = { ...DEFAULT_SETTINGS, onboardingDone: true };
    set({ settings });
    applyAppearance(settings);
    persist(settings);
  },
}));

const ACCENTS: Record<Accent, { dark: string; light: string; hue: number }> = {
  coral: { dark: "0.69 0.19 32", light: "0.67 0.2 32", hue: 32 },
  honey: { dark: "0.8 0.15 75", light: "0.72 0.15 70", hue: 75 },
  violet: { dark: "0.68 0.18 295", light: "0.58 0.2 295", hue: 295 },
  blue: { dark: "0.68 0.17 265", light: "0.58 0.19 265", hue: 265 },
  green: { dark: "0.74 0.15 160", light: "0.62 0.14 160", hue: 160 },
};

export function resolvedTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return pref;
}

export function applyAppearance(s: Settings) {
  const root = document.documentElement;
  const theme = resolvedTheme(s.appearance.theme);
  root.dataset.theme = theme;
  root.dataset.density = s.appearance.density;
  const a = ACCENTS[s.appearance.accent] ?? ACCENTS.coral;
  const base = theme === "dark" ? a.dark : a.light;
  root.style.setProperty("--accent", `oklch(${base})`);
  root.style.setProperty("--accent-soft", `oklch(${base} / ${theme === "dark" ? 0.16 : 0.12})`);
  root.style.setProperty("--accent-hover", `oklch(${base.replace(/^([\d.]+)/, (l) => String(+l + (theme === "dark" ? 0.05 : -0.05)))})`);
  root.style.setProperty("--focus", `oklch(${base})`);
  root.style.setProperty("--accent-text", theme === "dark" ? `oklch(0.8 0.14 ${a.hue})` : `oklch(0.52 0.19 ${a.hue})`);
  try {
    localStorage.setItem("aven.theme", s.appearance.theme);
  } catch {
    /* storage unavailable */
  }
}

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    const s = useSettings.getState().settings;
    if (s.appearance.theme === "system") applyAppearance(s);
  });
}
