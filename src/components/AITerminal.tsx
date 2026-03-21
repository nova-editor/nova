import { useEffect, useRef, useState, useCallback } from "react";

type Mode = "chat" | "agent";
import { Terminal as XTerm, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useStore, FileTab, AiProvider } from "../store";
import { Search, X } from "lucide-react";
import { AnthropicLogo, GeminiLogo, OpenAILogo } from "./AiLogos";

// ── Per-theme xterm palettes ──────────────────────────────────────────────────
const TERM_THEMES: Record<string, ITheme> = {
  atomDark: {
    background:"#1c1f26", foreground:"#ABB2BF", cursor:"#528BFF", cursorAccent:"#1c1f26", selectionBackground:"#3E4451",
    black:"#282C34", red:"#E06C75", green:"#98C379", yellow:"#E5C07B", blue:"#61AFEF", magenta:"#C678DD", cyan:"#56B6C2", white:"#ABB2BF",
    brightBlack:"#5C6370", brightRed:"#E06C75", brightGreen:"#98C379", brightYellow:"#E5C07B", brightBlue:"#61AFEF", brightMagenta:"#C678DD", brightCyan:"#56B6C2", brightWhite:"#FFFFFF",
  },
  dracula: {
    background:"#1E1F2B", foreground:"#F8F8F2", cursor:"#BD93F9", cursorAccent:"#1E1F2B", selectionBackground:"#44475A",
    black:"#21222C", red:"#FF5555", green:"#50FA7B", yellow:"#F1FA8C", blue:"#6272A4", magenta:"#BD93F9", cyan:"#8BE9FD", white:"#F8F8F2",
    brightBlack:"#6272A4", brightRed:"#FF6E6E", brightGreen:"#69FF94", brightYellow:"#FFFFA5", brightBlue:"#D6ACFF", brightMagenta:"#FF92DF", brightCyan:"#A4FFFF", brightWhite:"#FFFFFF",
  },
  nord: {
    background:"#2E3440", foreground:"#D8DEE9", cursor:"#88C0D0", cursorAccent:"#2E3440", selectionBackground:"#434C5E",
    black:"#3B4252", red:"#BF616A", green:"#A3BE8C", yellow:"#EBCB8B", blue:"#81A1C1", magenta:"#B48EAD", cyan:"#88C0D0", white:"#E5E9F0",
    brightBlack:"#4C566A", brightRed:"#BF616A", brightGreen:"#A3BE8C", brightYellow:"#EBCB8B", brightBlue:"#81A1C1", brightMagenta:"#B48EAD", brightCyan:"#8FBCBB", brightWhite:"#ECEFF4",
  },
  tokyoNight: {
    background:"#1a1b26", foreground:"#C0CAF5", cursor:"#7AA2F7", cursorAccent:"#1a1b26", selectionBackground:"#283457",
    black:"#15161e", red:"#F7768E", green:"#9ECE6A", yellow:"#E0AF68", blue:"#7AA2F7", magenta:"#9D7CD8", cyan:"#7DCFFF", white:"#ACB0D0",
    brightBlack:"#414868", brightRed:"#F7768E", brightGreen:"#9ECE6A", brightYellow:"#E0AF68", brightBlue:"#7AA2F7", brightMagenta:"#BB9AF7", brightCyan:"#7DCFFF", brightWhite:"#C0CAF5",
  },
  monokai: {
    background:"#272822", foreground:"#F8F8F2", cursor:"#A6E22E", cursorAccent:"#272822", selectionBackground:"#49483E",
    black:"#272822", red:"#F92672", green:"#A6E22E", yellow:"#E6DB74", blue:"#66D9E8", magenta:"#AE81FF", cyan:"#66D9E8", white:"#F8F8F2",
    brightBlack:"#75715E", brightRed:"#F92672", brightGreen:"#A6E22E", brightYellow:"#E6DB74", brightBlue:"#66D9E8", brightMagenta:"#AE81FF", brightCyan:"#66D9E8", brightWhite:"#FFFFFF",
  },
  gruvboxDark: {
    background:"#282828", foreground:"#EBDBB2", cursor:"#FABD2F", cursorAccent:"#282828", selectionBackground:"#504945",
    black:"#1D2021", red:"#CC241D", green:"#98971A", yellow:"#D79921", blue:"#458588", magenta:"#B16286", cyan:"#689D6A", white:"#A89984",
    brightBlack:"#928374", brightRed:"#FB4934", brightGreen:"#B8BB26", brightYellow:"#FABD2F", brightBlue:"#83A598", brightMagenta:"#D3869B", brightCyan:"#8EC07C", brightWhite:"#EBDBB2",
  },
  catppuccinMocha: {
    background:"#1E1E2E", foreground:"#CDD6F4", cursor:"#CBA6F7", cursorAccent:"#1E1E2E", selectionBackground:"#45475A",
    black:"#45475A", red:"#F38BA8", green:"#A6E3A1", yellow:"#F9E2AF", blue:"#89B4FA", magenta:"#CBA6F7", cyan:"#94E2D5", white:"#CDD6F4",
    brightBlack:"#585B70", brightRed:"#F38BA8", brightGreen:"#A6E3A1", brightYellow:"#F9E2AF", brightBlue:"#89B4FA", brightMagenta:"#CBA6F7", brightCyan:"#94E2D5", brightWhite:"#CDD6F4",
  },
  githubDark: {
    background:"#0D1117", foreground:"#E6EDF3", cursor:"#58A6FF", cursorAccent:"#0D1117", selectionBackground:"#264F78",
    black:"#161B22", red:"#FF7B72", green:"#7EE787", yellow:"#E3B341", blue:"#79C0FF", magenta:"#D2A8FF", cyan:"#39C5CF", white:"#B1BAC4",
    brightBlack:"#484F58", brightRed:"#FF7B72", brightGreen:"#7EE787", brightYellow:"#E3B341", brightBlue:"#79C0FF", brightMagenta:"#D2A8FF", brightCyan:"#39C5CF", brightWhite:"#E6EDF3",
  },
  rosePine: {
    background:"#191724", foreground:"#E0DEF4", cursor:"#EB6F92", cursorAccent:"#191724", selectionBackground:"#403D52",
    black:"#26233A", red:"#EB6F92", green:"#31748F", yellow:"#F6C177", blue:"#9CCFD8", magenta:"#C4A7E7", cyan:"#EBBCBA", white:"#E0DEF4",
    brightBlack:"#6E6A86", brightRed:"#EB6F92", brightGreen:"#31748F", brightYellow:"#F6C177", brightBlue:"#9CCFD8", brightMagenta:"#C4A7E7", brightCyan:"#EBBCBA", brightWhite:"#E0DEF4",
  },
  palenight: {
    background:"#292D3E", foreground:"#A6ACCD", cursor:"#89DDFF", cursorAccent:"#292D3E", selectionBackground:"#444B6A",
    black:"#292D3E", red:"#F07178", green:"#C3E88D", yellow:"#FFCB6B", blue:"#82AAFF", magenta:"#C792EA", cyan:"#89DDFF", white:"#EEFFFF",
    brightBlack:"#676E95", brightRed:"#F07178", brightGreen:"#C3E88D", brightYellow:"#FFCB6B", brightBlue:"#82AAFF", brightMagenta:"#C792EA", brightCyan:"#89DDFF", brightWhite:"#FFFFFF",
  },
};

// ── Per-provider accent colors (cursor + selection tint) ─────────────────────
const PROVIDER_ACCENTS: Record<AiProvider, { cursor: string; selection: string }> = {
  claude: { cursor: "#D97559", selection: "#D9755930" },
  gemini: { cursor: "#1a73e8", selection: "#1a73e830" },
  codex:  { cursor: "#10a37f", selection: "#10a37f30" },
};

function getTermTheme(name: string, provider?: AiProvider): ITheme {
  const t = TERM_THEMES[name] ?? TERM_THEMES.atomDark;
  const base: ITheme = { ...t, background: "transparent" };
  if (!provider) return base;
  const accent = PROVIDER_ACCENTS[provider];
  return {
    ...base,
    cursor:              accent.cursor,
    cursorAccent:        t.background,
    selectionBackground: accent.selection,
  };
}

// ── Search overlay ────────────────────────────────────────────────────────────
function SearchBar({ addon, onClose }: { addon: SearchAddon | null; onClose: () => void }) {
  const [q, setQ]   = useState("");
  const [cs, setCs] = useState(false);
  const [rx, setRx] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const find = (dir: "next" | "prev") => {
    if (!addon || !q) return;
    const opts = { caseSensitive: cs, regex: rx };
    dir === "next" ? addon.findNext(q, opts) : addon.findPrevious(q, opts);
  };
  return (
    <div
      className="absolute right-3 top-2 z-50 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shadow-xl border border-editor-border fade-in"
      style={{ background: "rgb(var(--c-sidebar))" }}
    >
      <Search size={11} className="text-editor-comment shrink-0" />
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") find(e.shiftKey ? "prev" : "next");
          if (e.key === "Escape") onClose();
        }}
        placeholder="Search…"
        className="w-44 bg-transparent text-xs font-mono text-editor-fg outline-none placeholder-editor-comment/40"
      />
      <button onClick={() => setCs((v) => !v)} title="Case sensitive"
        className={`px-1.5 py-0.5 rounded text-2xs font-mono transition-colors ${cs ? "bg-editor-accent/20 text-editor-accent" : "text-editor-comment hover:text-editor-fg"}`}>Aa</button>
      <button onClick={() => setRx((v) => !v)} title="Regex"
        className={`px-1.5 py-0.5 rounded text-2xs font-mono transition-colors ${rx ? "bg-editor-accent/20 text-editor-accent" : "text-editor-comment hover:text-editor-fg"}`}>.*</button>
      <div className="w-px h-3 bg-editor-border mx-0.5" />
      <button onClick={() => find("prev")} className="text-editor-comment hover:text-editor-fg text-xs px-0.5 transition-colors">↑</button>
      <button onClick={() => find("next")} className="text-editor-comment hover:text-editor-fg text-xs px-0.5 transition-colors">↓</button>
      <button onClick={onClose} className="ml-1 text-editor-comment hover:text-editor-fg transition-colors"><X size={11} /></button>
    </div>
  );
}

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDER_INFO: Record<AiProvider, {
  findCmd: string;
  label: string;
  installHint: string;
  accentColor: string;
}> = {
  claude: {
    findCmd: "find_claude_path",
    label: "Claude Code",
    installHint: "npm install -g @anthropic-ai/claude-code",
    accentColor: "rgb(var(--c-accent))",
  },
  gemini: {
    findCmd: "find_gemini_path",
    label: "Gemini",
    installHint: "npm install -g @google/gemini-cli",
    accentColor: "#1a73e8",
  },
  codex: {
    findCmd: "find_codex_path",
    label: "Codex",
    installHint: "npm install -g @openai/codex",
    accentColor: "#10a37f",
  },
};

// ── Mode toggle pill (Claude-only) ────────────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      border: "1px solid rgb(var(--c-border) / 0.5)",
      borderRadius: 6, overflow: "hidden",
    }}>
      {(["chat", "agent"] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: "3px 10px", fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: active ? 600 : 400, letterSpacing: "0.03em",
              background: active ? "rgb(var(--c-accent) / 0.15)" : "transparent",
              color: active ? "rgb(var(--c-accent))" : "rgb(var(--c-comment))",
              border: "none",
              borderRight: m === "chat" ? "1px solid rgb(var(--c-border) / 0.5)" : "none",
              cursor: active ? "default" : "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface AITerminalProps {
  tab: FileTab;
  visible: boolean;
}

export function AITerminal({ tab, visible }: AITerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerm | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const searchRef    = useRef<SearchAddon | null>(null);
  const unlistenRef  = useRef<UnlistenFn | null>(null);
  const roRef        = useRef<ResizeObserver | null>(null);
  const inited       = useRef(false);
  const atBottomRef  = useRef(true);
  const resizeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef      = useRef<Mode>("agent");

  const provider = (tab.aiProvider ?? "claude") as AiProvider;
  const info = PROVIDER_INFO[provider];
  // session ID derived from tab path (already unique per-session)
  const sessionId = tab.path;

  const themeName    = useStore((s) => s.settings.editor.theme);
  const termSettings = useStore((s) => s.settings.terminal);
  const cwd          = useStore((s) => s.workspaceRoot) || ".";

  const [cliPath,     setCliPath]    = useState<string | null>(null);
  const [findError,   setFindError]  = useState<string | null>(null);
  const [showSearch,  setShowSearch] = useState(false);
  const [mode,        setMode]       = useState<Mode>("agent");
  const [restartKey,  setRestartKey] = useState(0);

  // ── Locate CLI binary once ────────────────────────────────────────────────
  useEffect(() => {
    invoke<string>(info.findCmd)
      .then((p) => setCliPath(p))
      .catch((e: unknown) => setFindError(String(e)));
  }, [info.findCmd]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    const id = sessionId;
    return () => {
      inited.current = false;
      roRef.current?.disconnect();
      unlistenRef.current?.();
      termRef.current?.dispose();
      termRef.current = null;
      invoke("pty_kill", { sessionId: id }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Switch mode: kill PTY and respawn with new args ──────────────────────
  const switchMode = useCallback((newMode: Mode) => {
    if (newMode === modeRef.current) return;
    modeRef.current = newMode;
    unlistenRef.current?.();
    unlistenRef.current = null;
    invoke("pty_kill", { sessionId }).catch(() => {});
    inited.current = false;
    termRef.current?.writeln("\r\n\x1b[90m───────────────────────────────────────────────────\x1b[0m");
    termRef.current?.writeln(`\x1b[90m  switching to ${newMode} mode…\x1b[0m`);
    termRef.current?.writeln("\x1b[90m───────────────────────────────────────────────────\x1b[0m\r\n");
    setMode(newMode);
    setRestartKey((k) => k + 1);
  }, [sessionId]);

  // ── Init xterm + spawn PTY — fires once when visible & path known ─────────
  useEffect(() => {
    if (inited.current || !cliPath || !visible || !containerRef.current) return;
    inited.current = true;

    // On mode-switch respawn, xterm is already set up — skip re-creation
    const isRespawn = termRef.current != null;

    const term = isRespawn ? termRef.current! : new XTerm({
      theme:             getTermTheme(themeName),
      fontFamily:        "'JetBrains Mono', 'JetBrainsMono Nerd Font', monospace",
      fontSize:          termSettings.fontSize,
      lineHeight:        termSettings.lineHeight,
      cursorBlink:       true,
      scrollback:        termSettings.scrollback,
      allowProposedApi:  true,
      allowTransparency: true,
      macOptionIsMeta:   true,
    });

    if (!isRespawn) {
      const fit     = new FitAddon();
      const links   = new WebLinksAddon();
      const unicode = new Unicode11Addon();
      const search  = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.loadAddon(search);

      try {
        term.open(containerRef.current);
        // Unicode11 must be activated AFTER open() in xterm v5
        term.loadAddon(unicode);
        term.unicode.activeVersion = "11";
      } catch (e) {
        console.error("[AITerminal] xterm open failed:", e);
        // Do NOT reset inited.current — prevents a retry loop on re-render
        term.dispose();
        return;
      }
      termRef.current   = term;
      fitRef.current    = fit;
      searchRef.current = search;

      // ── Keyboard shortcuts ──────────────────────────────────────────────
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key === "c") {
          const sel = termRef.current?.getSelection();
          if (sel) { navigator.clipboard.writeText(sel); return false; }
          return true; // → SIGINT
        }
        if (meta && e.key === "k") { term.clear(); return false; }
        if (meta && e.key === "f") { setShowSearch((v) => !v); return false; }
        return true;
      });

      // User input → PTY
      term.onData((data) => invoke("pty_write", { sessionId, data }).catch(() => {}));

      // Track whether we're at the bottom so resize can preserve position
      term.onScroll(() => {
        const buf = term.buffer.active;
        atBottomRef.current = buf.viewportY >= buf.length - term.rows;
      });

      // ResizeObserver → debounced refit (50ms prevents 60fps glitching during drag)
      const ro = new ResizeObserver(() => {
        if (resizeTimer.current) clearTimeout(resizeTimer.current);
        resizeTimer.current = setTimeout(() => {
          resizeTimer.current = null;
          requestAnimationFrame(() => {
            const container = containerRef.current;
            if (!fitRef.current || !termRef.current || !container) return;
            if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
            const wasAtBottom = atBottomRef.current;
            fitRef.current.fit();
            if (wasAtBottom) termRef.current.scrollToBottom();
            const { rows, cols } = termRef.current;
            invoke("pty_resize", { sessionId, rows, cols }).catch(() => {});
          });
        }, 50);
      });
      ro.observe(containerRef.current);
      roRef.current = ro;
    }

    // PTY output → xterm
    let listenCancelled = false;
    listen<string>(`pty-output-${sessionId}`, (ev) =>
      termRef.current?.write(ev.payload)
    ).then((fn) => {
      if (listenCancelled) { fn(); return; }
      unlistenRef.current = fn;
    });

    // Fit then spawn
    const spawnArgs = provider === "claude" && modeRef.current === "chat"
      ? ["--allowedTools", "Read,WebSearch", "--model", "claude-haiku-4-5-20251001", "--effort", "low"]
      : null;
    let spawnCancelled = false;
    const doSpawn = () => {
      if (spawnCancelled || !fitRef.current || !termRef.current) return;
      const container = containerRef.current;
      if (container && (container.offsetWidth === 0 || container.offsetHeight === 0)) {
        requestAnimationFrame(doSpawn);
        return;
      }
      fitRef.current.fit();
      termRef.current.focus();
      const { rows, cols } = termRef.current;
      invoke("pty_spawn", {
        sessionId,
        cwd,
        rows,
        cols,
        shell: cliPath,
        args: spawnArgs,
      }).catch((err) => {
        termRef.current?.writeln(`\x1b[31mFailed to start ${info.label}: ${err}\x1b[0m`);
      });
    };
    requestAnimationFrame(doSpawn);

    return () => { spawnCancelled = true; listenCancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliPath, visible, restartKey]);

  // ── Refit + focus on visibility change ───────────────────────────────────
  useEffect(() => {
    if (!visible || !inited.current) return;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!fitRef.current || !termRef.current || !container) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      const wasAtBottom = atBottomRef.current;
      fitRef.current.fit();
      if (wasAtBottom) termRef.current.scrollToBottom();
      const { rows, cols } = termRef.current;
      invoke("pty_resize", { sessionId, rows, cols }).catch(() => {});
      termRef.current.focus();
    });
  }, [visible, sessionId]);

  // ── Live theme update ─────────────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTermTheme(themeName);
  }, [themeName]);

  // ── Live font update ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.fontSize   = termSettings.fontSize;
    termRef.current.options.lineHeight = termSettings.lineHeight;
    const wasAtBottom = atBottomRef.current;
    requestAnimationFrame(() => {
      if (!fitRef.current || !termRef.current) return;
      fitRef.current.fit();
      if (wasAtBottom) termRef.current.scrollToBottom();
      const { rows, cols } = termRef.current;
      invoke("pty_resize", { sessionId, rows, cols }).catch(() => {});
    });
  }, [termSettings.fontSize, termSettings.lineHeight, sessionId]);

  // ── Search bar visibility ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) {
      searchRef.current?.clearDecorations();
      if (visible) termRef.current?.focus();
    }
  }, [showSearch, visible]);

  const Logo = provider === "claude" ? AnthropicLogo : provider === "gemini" ? GeminiLogo : OpenAILogo;

  return (
    <div style={{
      position:             "absolute",
      inset:                0,
      display:              visible ? "flex" : "none",
      flexDirection:        "column",
      overflow:             "hidden",
      background:           "rgb(var(--c-blue) / 0.04)",
      backdropFilter:       "blur(20px) saturate(1.4)",
      WebkitBackdropFilter: "blur(20px) saturate(1.4)",
    }}>
      {/* Header — Claude-only, shows mode toggle */}
      {provider === "claude" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px",
          borderBottom: "1px solid rgb(var(--c-border) / 0.5)",
          flexShrink: 0,
        }}>
          <AnthropicLogo size={13} style={{ color: "#D97757" }} />
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "rgb(var(--c-fg))" }}>
            Claude
          </span>
          <div style={{ flex: 1 }} />
          <ModeToggle mode={mode} onChange={switchMode} />
        </div>
      )}

      {/* Terminal area fills remaining space */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

        {/* Error: CLI not found */}
        {findError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 select-none"
               style={{ background: "rgb(var(--c-deep))" }}>
            <Logo size={40} style={{ opacity: 0.25, color: "rgb(var(--c-fg))" }} />
            <div className="flex flex-col items-center gap-2 text-center max-w-xs">
              <span style={{ color: "rgb(var(--c-fg))", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                {info.label} CLI not found
              </span>
              <pre style={{ color: "rgb(var(--c-comment))", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", textAlign: "center" }}>
                {findError}
              </pre>
            </div>
          </div>
        )}

        {/* Loading */}
        {!cliPath && !findError && (
          <div className="absolute inset-0 flex items-center justify-center"
               style={{ background: "rgb(var(--c-deep))" }}>
            <span style={{ color: "rgb(var(--c-comment))", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              locating {info.label}…
            </span>
          </div>
        )}

        {showSearch && <SearchBar addon={searchRef.current} onClose={() => setShowSearch(false)} />}

        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
}
