import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/800.css";
import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootStore } from "./store";

bootStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker (production only; Vite dev server has no sw.js build).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a nice-to-have; the game needs the network anyway.
    });
  });
}
