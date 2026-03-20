import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore, AiProvider } from "../store";
import { AnthropicLogo, GeminiLogo, OpenAILogo } from "./AiLogos";

interface ProviderDef {
  id:          AiProvider;
  name:        string;
  by:          string;
  tagline:     string;
  Logo:        React.ComponentType<{ size?: number; colored?: boolean; style?: React.CSSProperties }>;
  accent:      string;
  install:     string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id:      "claude",
    name:    "Claude Code",
    by:      "Anthropic",
    tagline: "Agentic coding — reads, edits and runs your codebase end-to-end",
    Logo:    AnthropicLogo,
    accent:  "#c96442",
    install: "npm i -g @anthropic-ai/claude-code",
  },
  {
    id:      "gemini",
    name:    "Gemini",
    by:      "Google",
    tagline: "Multimodal AI with 1 M-token context for massive codebases",
    Logo:    GeminiLogo,
    accent:  "#4285F4",
    install: "npm i -g @google/gemini-cli",
  },
  {
    id:      "codex",
    name:    "Codex",
    by:      "OpenAI",
    tagline: "Cloud-sandboxed agent that writes, tests and fixes code autonomously",
    Logo:    OpenAILogo,
    accent:  "#10a37f",
    install: "npm i -g @openai/codex",
  },
];

interface AIPanelProps {
  onClose: () => void;
}

export function AIPanel({ onClose }: AIPanelProps) {
  const openAiTab = useStore((s) => s.openAiTab);
  const ref       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // small delay so the button click that opened us doesn't immediately close us
    const t = setTimeout(() => window.addEventListener("mousedown", handler), 80);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const open = (id: AiProvider) => { openAiTab(id); onClose(); };

  return (
    <div
      ref={ref}
      style={{
        position:             "fixed",
        top:                  44,              // just below the 36px title bar
        left:                 100,
        width:                340,
        zIndex:               100,
        borderRadius:         10,
        border:               "1px solid rgb(var(--c-border))",
        background:           "rgb(var(--c-sidebar) / 0.98)",
        backdropFilter:       "blur(28px) saturate(1.6)",
        WebkitBackdropFilter: "blur(28px) saturate(1.6)",
        boxShadow:            "0 8px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset",
        overflow:             "hidden",
        display:              "flex",
        flexDirection:        "column",
      }}
    >
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "11px 14px 10px",
        borderBottom:   "1px solid rgb(var(--c-border))",
      }}>
        <span style={{
          fontSize:      11,
          fontWeight:    700,
          fontFamily:    "'JetBrains Mono', monospace",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color:         "rgb(var(--c-fg))",
        }}>
          AI Agents
        </span>
        <button
          onClick={onClose}
          style={{
            display:      "flex",
            alignItems:   "center",
            background:   "none",
            border:       "none",
            cursor:       "pointer",
            padding:      "2px 3px",
            borderRadius: 4,
            color:        "rgb(var(--c-comment))",
            transition:   "color 0.12s, background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-fg))";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-comment))";
            (e.currentTarget as HTMLElement).style.background = "none";
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Providers */}
      <div style={{ padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {PROVIDERS.map((p) => (
          <ProviderRow key={p.id} p={p} onOpen={() => open(p.id)} />
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        borderTop:  "1px solid rgb(var(--c-border))",
        padding:    "7px 14px",
        fontSize:   9.5,
        fontFamily: "'JetBrains Mono', monospace",
        color:      "rgb(var(--c-comment))",
        letterSpacing: "0.02em",
      }}>
        ⌘⇧C  toggle panel  ·  split panes for parallel sessions
      </div>
    </div>
  );
}

function ProviderRow({ p, onOpen }: { p: ProviderDef; onOpen: () => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "9px 8px",
        borderRadius: 7,
        cursor:       "default",
        transition:   "background 0.12s",
        userSelect:   "none",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
    >
      {/* Logo box */}
      <div style={{
        width:          36,
        height:         36,
        borderRadius:   8,
        background:     p.accent + "16",
        border:         `1px solid ${p.accent}30`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      }}>
        <p.Logo size={18} colored style={{ color: p.accent }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-fg))" }}>
            {p.name}
          </span>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-comment))" }}>
            {p.by}
          </span>
        </div>
        <span style={{ fontSize: 10, fontFamily: "Inter, -apple-system, sans-serif", color: "rgb(var(--c-comment))", lineHeight: 1.4, display: "block", marginTop: 1 }}>
          {p.tagline}
        </span>
      </div>

      {/* Open button */}
      <button
        onClick={onOpen}
        style={{
          flexShrink:   0,
          padding:      "4px 11px",
          borderRadius: 5,
          border:       `1px solid ${p.accent}55`,
          background:   p.accent + "18",
          color:        p.accent,
          fontSize:     10.5,
          fontFamily:   "'JetBrains Mono', monospace",
          fontWeight:   700,
          cursor:       "pointer",
          transition:   "background 0.12s, border-color 0.12s",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background   = p.accent + "30";
          el.style.borderColor  = p.accent + "99";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background  = p.accent + "18";
          el.style.borderColor = p.accent + "55";
        }}
      >
        Open
      </button>
    </div>
  );
}
