import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles/app.css";
import "./styles/engine-theme.css";
import { App } from "./App";
import { installTextStyleHooks } from "./engine/textStyle";

installTextStyleHooks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
