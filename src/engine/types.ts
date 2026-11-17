// The native Aven document model. The drawing engine (Excalidraw) only ever sees
// `scene`; everything else (layers, components, links, metadata) is Aven's own.
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

export type { ExcalidrawElement, BinaryFiles };

export const AVEN_FORMAT_VERSION = 1;
export const AVEN_LINK_PREFIX = "aven://drawing/";

/** The subset of editor view state that is persisted with a drawing. */
export interface SavedAppState {
  viewBackgroundColor: string;
  /** Aven canvas look: dotted texture (default), off-white paper or dark */
  canvasStyle?: "light" | "dark" | "light-dots" | "dark-dots" | "dots" | "paper";
  gridSize: number;
  gridStep: number;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
  currentItemFontFamily?: number;
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  currentItemRoughness?: number;
  currentItemStrokeWidth?: number;
}

export interface LayerDef {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0–100, multiplies every element's own opacity */
  opacity: number;
  /** id of a group layer (kind: "group") that contains this layer */
  parentId?: string | null;
  kind?: "layer" | "group";
  collapsed?: boolean;
}

export interface LayerState {
  layers: LayerDef[]; // bottom → top
  activeLayerId: string;
  /** elements that live on hidden layers are kept out of the canvas */
  hidden: ExcalidrawElement[];
}

export interface ComponentDef {
  id: string;
  name: string;
  category: string;
  /** elements normalised so the component's top-left corner is at (0, 0) */
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface DrawingLink {
  /** target drawing id (or project id when kind is "project") */
  id: string;
  kind: "drawing" | "project" | "url";
  label: string;
  url?: string;
}

export interface DocumentMeta {
  tags: string[];
  description: string;
  templateId?: string;
  isTemplate?: boolean;
  templateCategory?: string;
}

export interface AvenDocument {
  type: "aven-drawing";
  version: number;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  app: { name: "Aven"; version: string };
  scene: {
    elements: ExcalidrawElement[];
    appState: SavedAppState;
    files: BinaryFiles;
  };
  layers: LayerState | null;
  components: ComponentDef[];
  links: DrawingLink[];
  meta: DocumentMeta;
}

export const DEFAULT_APP_STATE: SavedAppState = {
  viewBackgroundColor: "transparent",
  canvasStyle: "dots",
  gridSize: 20,
  gridStep: 5,
  gridModeEnabled: false,
  objectsSnapModeEnabled: false,
};
