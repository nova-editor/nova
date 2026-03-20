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
  document.documentElement.style.setProperty("--surface-alpha", "1");
} catch {
  applyThemeVars("atomDark", false);
  document.documentElement.style.setProperty("--surface-alpha", "1");
}

// ── Error Boundary — catches render crashes so we never show a blank black screen ──
interface EBState { error: Error | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: "fixed", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgb(24 27 33)", color: "rgb(171 178 191)",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, gap: 16, padding: 32,
        }}>
          <span style={{ fontSize: 32 }}>の</span>
          <span style={{ color: "rgb(224 108 117)", fontWeight: 600 }}>nova crashed</span>
          <pre style={{
            maxWidth: 640, whiteSpace: "pre-wrap", wordBreak: "break-all",
            background: "rgb(33 37 43)", padding: "12px 16px", borderRadius: 8,
            fontSize: 11, color: "rgb(224 108 117)", lineHeight: 1.6,
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); }}
            style={{
              padding: "6px 20px", borderRadius: 6, border: "1px solid rgb(62 68 81)",
              background: "rgb(44 49 58)", color: "rgb(171 178 191)", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
