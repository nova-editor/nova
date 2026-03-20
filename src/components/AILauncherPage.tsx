import { useState } from "react";
import { useStore, AiProvider } from "../store";
import { AnthropicLogo, GeminiLogo, OpenAILogo } from "./AiLogos";

interface ProviderDef {
  id:     AiProvider;
  name:   string;
  sub:    string;
  Logo:   React.ComponentType<{ size?: number; colored?: boolean; style?: React.CSSProperties }>;
  accent: string;
}

const PROVIDERS: ProviderDef[] = [
  { id: "claude", name: "Claude",  sub: "Anthropic",  Logo: AnthropicLogo, accent: "#D97757" },
  { id: "gemini", name: "Gemini",  sub: "Google",     Logo: GeminiLogo,    accent: "#4285F4" },
  { id: "codex",  name: "Codex",   sub: "OpenAI",     Logo: OpenAILogo,    accent: "#74AA9C" },
];

interface AILauncherPageProps {
  tabPath: string;
}

export function AILauncherPage({ tabPath }: AILauncherPageProps) {
  const replaceTabWithAi = useStore((s) => s.replaceTabWithAi);

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full select-none"
      style={{
        background:           "rgb(var(--c-blue) / 0.04)",
        backdropFilter:       "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        gap: 0,
      }}
    >
      {/* Heading */}
      <span style={{
        fontSize:      11,
        fontFamily:    "'JetBrains Mono', monospace",
        fontWeight:    500,
        color:         "rgba(255,255,255,0.25)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom:  36,
      }}>
        AI Agents
      </span>

      {/* Tiles row */}
      <div style={{ display: "flex", gap: 12 }}>
        {PROVIDERS.map((p) => (
          <ProviderTile
            key={p.id}
            p={p}
            onOpen={() => replaceTabWithAi(tabPath, p.id)}
          />
        ))}
      </div>

      {/* Hint */}
      <span style={{
        marginTop:     32,
        fontSize:      10,
        fontFamily:    "'JetBrains Mono', monospace",
        color:         "rgba(255,255,255,0.13)",
        letterSpacing: "0.04em",
      }}>
        ⌘⇧C  ·  new launcher
      </span>
    </div>
  );
}

function ProviderTile({ p, onOpen }: { p: ProviderDef; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:              "flex",
        flexDirection:        "column",
        alignItems:           "center",
        gap:                  0,
        width:                112,
        padding:              "20px 0 18px",
        background:           hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border:               `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        borderRadius:         16,
        cursor:               "pointer",
        transform:            hovered ? "translateY(-2px)" : "translateY(0)",
        transition:           "background 0.15s, border-color 0.15s, transform 0.14s",
        boxShadow:            hovered ? `0 8px 32px rgba(0,0,0,0.28)` : "none",
      }}
    >
      <div style={{ marginBottom: 14, opacity: hovered ? 1 : 0.75, transition: "opacity 0.15s" }}>
        <p.Logo size={32} colored style={{ color: p.accent }} />
      </div>

      <span style={{
        fontSize:      12,
        fontFamily:    "'JetBrains Mono', monospace",
        fontWeight:    500,
        color:         hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)",
        transition:    "color 0.15s",
        letterSpacing: "-0.01em",
      }}>
        {p.name}
      </span>

      <span style={{
        marginTop:     3,
        fontSize:      9,
        fontFamily:    "'JetBrains Mono', monospace",
        color:         "rgba(255,255,255,0.25)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        {p.sub}
      </span>
    </button>
  );
}
