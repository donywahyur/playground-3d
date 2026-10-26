import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Cache } from "three";
import { App } from "./App";
import "./index.css";

// Every Kenney GLB references its kit's shared Textures/colormap.png. Without the cache, each file decodes its own
// copy (~1 MB as an ImageBitmap, ~120 of them); with it, one decode per URL.
Cache.enabled = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
