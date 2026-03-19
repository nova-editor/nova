import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./iconSetup";
import { applyThemeVars } from "./theme/themes";

// Apply the saved theme before the first render — eliminates the flash of default theme
try {
  const saved = JSON.parse(localStorage.getItem("nova-settings") || "{}");
  applyThemeVars(saved?.editor?.theme ?? "atomDark", saved?.fullDark ?? false);
  // Surface alpha: start opaque; App.tsx sets to 0 once the image loads
  document.documentElement.style.setProperty("--surface-alpha", "1");
} catch {
  applyThemeVars("atomDark", false);
  document.documentElement.style.setProperty("--surface-alpha", "1");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
