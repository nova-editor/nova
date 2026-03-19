/**
 * nova Terminal — VSCode-parity integrated terminal.
 *
 * Functional fixes over previous version:
 *  • PTY spawn now happens AFTER fit() so the shell gets correct dimensions
 *  • ResizeObserver guards against 0×0 fits on hidden (display:none) containers
 *  • OSC handlers are properly disposed on session unmount (no memory leaks)
 *  • Split pane no longer blanks the left side when it receives focus —
 *    mainActiveId (tab selection) is independent from split focus tracking
 *  • TerminalPane init is driven by visibility, not focus — inactive tabs
 *    initialize as soon as the panel is visible, so switching feels instant
 *
 * UI features (unchanged):
 *  • Multiple sessions (tabs), shell-selector per session
 *  • Horizontal split panes (two PTYs side by side)
 *  • Right-click context menu: Copy / Paste / Select All / Clear / Split
 *  • Cmd+C = copy selection OR send SIGINT (when nothing selected)
 *  • Cmd+V = paste from clipboard
 *  • Cmd+F / Ctrl+Shift+F = terminal search (SearchAddon)
 *  • Shell profile picker — reads /etc/shells on startup
 *  • Tab title from OSC 0/2 (process title) + OSC 7 (CWD)
 *  • Command exit-code indicator via OSC 133 shell-integration
 *  • Session rename (double-click tab)
 *  • Drag-to-resize panel height
 *  • Maximize toggle (70 % window height)
 *  • Per-theme xterm color palettes (all 10 app themes)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm, ITheme } from "@xterm/xterm";
import { FitAddon }       from "@xterm/addon-fit";
import { WebLinksAddon }  from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon }    from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import {
  Plus, X, SplitSquareHorizontal, Search,
  Trash2, ChevronDown, Maximize2, Minimize2,
  ChevronRight, CheckCircle2, XCircle,
} from "lucide-react";
import { invoke }                from "@tauri-apps/api/core";
import { listen, UnlistenFn }   from "@tauri-apps/api/event";
import { useStore }              from "../store";

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
const getTermTheme = (name: string): ITheme => TERM_THEMES[name] ?? TERM_THEMES.atomDark;

// ── Helpers ───────────────────────────────────────────────────────────────────
function shortPath(p: string): string {
  const parts = p.replace(/\/$/, "").split("/");
  return parts.at(-1) || p;
}
function shellName(s: string): string {
  return s.split("/").at(-1) || s;
}

// ── Context menu ──────────────────────────────────────────────────────────────
interface CtxItem { label: string; icon?: React.ReactNode; danger?: boolean; action: () => void; }
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void; }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key  = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown",   key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const menuH = items.length * 30 + 8;
  const top  = y + menuH > window.innerHeight ? y - menuH : y;
  const left = x + 180  > window.innerWidth  ? x - 180   : x;
  return (
    <div
      ref={ref}
      className="fixed z-[500] py-1 rounded-lg border border-editor-border shadow-2xl overflow-hidden fade-in"
      style={{ top, left, width: 180, background: "rgb(var(--c-sidebar))" }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors
            ${item.danger ? "text-red-400 hover:bg-red-500/10" : "text-editor-fg hover:bg-white/[0.06]"}`}
        >
          {item.icon && <span className={item.danger ? "text-red-400" : "text-editor-comment"}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
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
    <div className="absolute right-3 top-1 z-50 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shadow-xl border border-editor-border fade-in"
         style={{ background: "rgb(var(--c-sidebar))" }}>
      <Search size={11} className="text-editor-comment shrink-0" />
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key==="Enter") find(e.shiftKey?"prev":"next"); if(e.key==="Escape") onClose(); }}
        placeholder="Search terminal…"
        className="w-44 bg-transparent text-xs font-mono text-editor-fg outline-none placeholder-editor-comment/40"
      />
      <button onClick={() => setCs(v=>!v)} title="Case sensitive"
        className={`px-1.5 py-0.5 rounded text-2xs font-mono transition-colors ${cs?"bg-editor-accent/20 text-editor-accent":"text-editor-comment hover:text-editor-fg"}`}>Aa</button>
      <button onClick={() => setRx(v=>!v)} title="Regex"
        className={`px-1.5 py-0.5 rounded text-2xs font-mono transition-colors ${rx?"bg-editor-accent/20 text-editor-accent":"text-editor-comment hover:text-editor-fg"}`}>.*</button>
      <div className="w-px h-3 bg-editor-border mx-0.5" />
      <button onClick={()=>find("prev")} title="Prev (Shift+Enter)" className="text-editor-comment hover:text-editor-fg text-xs px-0.5 transition-colors">↑</button>
      <button onClick={()=>find("next")} title="Next (Enter)"      className="text-editor-comment hover:text-editor-fg text-xs px-0.5 transition-colors">↓</button>
      <button onClick={onClose} className="ml-1 text-editor-comment hover:text-editor-fg transition-colors"><X size={11} /></button>
    </div>
  );
}

// ── Session model ─────────────────────────────────────────────────────────────
interface Session {
  id:       string;
  shell:    string;
  label:    string;
  title:    string;
  cwd:      string;
  exitCode: number | null;
}

// ── Single PTY pane ───────────────────────────────────────────────────────────
interface PaneProps {
  session:      Session;
  /** Hide this pane (display:none). Inactive tabs are hidden, not unmounted. */
  hidden:       boolean;
  /** Give keyboard focus to this pane's terminal instance. */
  focused:      boolean;
  visible:      boolean;
  height:       number;
  initCwd:      string;
  fontSize:     number;
  lineHeight:   number;
  scrollback:   number;
  themeName:    string;
  showSearch:   boolean;
  onHideSearch: ()               => void;
  onAddonReady: (a: SearchAddon) => void;
  onTermReady:  (t: XTerm)       => void;
  onTitle:      (t: string)      => void;
  onCwd:        (d: string)      => void;
  onExitCode:   (c: number)      => void;
  onZoom:       (d: number)      => void;
  onClose:      ()               => void;
  onSplit:      ()               => void;
}

function TerminalPane({
  session, hidden, focused, visible, height, initCwd,
  fontSize, lineHeight, scrollback, themeName,
  showSearch, onHideSearch, onAddonReady, onTermReady,
  onTitle, onCwd, onExitCode, onZoom, onClose, onSplit,
}: PaneProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const termRef        = useRef<XTerm | null>(null);
  const fitRef         = useRef<FitAddon | null>(null);
  const searchRef      = useRef<SearchAddon | null>(null);
  const unlistenRef    = useRef<UnlistenFn | null>(null);
  const roRef          = useRef<ResizeObserver | null>(null);
  const oscDisposables = useRef<Array<{ dispose(): void }>>([]);
  const inited         = useRef(false);

  // Stable refs for callbacks registered once at init time
  const rOnZoom      = useRef(onZoom);
  const rOnClose     = useRef(onClose);
  const rOnSplit     = useRef(onSplit);
  const rOnTitle     = useRef(onTitle);
  const rOnCwd       = useRef(onCwd);
  const rOnExitCode  = useRef(onExitCode);
  const rOnAddon     = useRef(onAddonReady);
  const rOnTermReady = useRef(onTermReady);
  useEffect(() => { rOnZoom.current      = onZoom;       }, [onZoom]);
  useEffect(() => { rOnClose.current     = onClose;      }, [onClose]);
  useEffect(() => { rOnSplit.current     = onSplit;      }, [onSplit]);
  useEffect(() => { rOnTitle.current     = onTitle;      }, [onTitle]);
  useEffect(() => { rOnCwd.current       = onCwd;        }, [onCwd]);
  useEffect(() => { rOnExitCode.current  = onExitCode;   }, [onExitCode]);
  useEffect(() => { rOnAddon.current     = onAddonReady; }, [onAddonReady]);
  useEffect(() => { rOnTermReady.current = onTermReady;  }, [onTermReady]);

  // Cleanup on unmount — pty_kill is the ONLY place we kill the session.
  useEffect(() => {
    const id = session.id;
    return () => {
      roRef.current?.disconnect();
      unlistenRef.current?.();
      oscDisposables.current.forEach((d) => d.dispose());
      oscDisposables.current = [];
      termRef.current?.dispose();
      termRef.current = null;
      invoke("pty_kill", { sessionId: id }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Initialise once — fires when the pane first becomes visible (not hidden) ──
  // We init all tabs as soon as the panel opens so switching feels instant.
  // Spawning the PTY happens AFTER fonts.ready+fit so the shell gets the
  // correct terminal dimensions rather than xterm's default 80×24.
  useEffect(() => {
    if (inited.current || hidden || !visible || !containerRef.current) return;
    inited.current = true;

    const term = new XTerm({
      theme:                 getTermTheme(themeName),
      fontFamily:            "'JetBrains Mono', 'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', 'Fira Code', monospace",
      fontSize,
      lineHeight,
      cursorBlink:           true,
      scrollback,
      allowProposedApi:      true,
      macOptionIsMeta:       true,
      rightClickSelectsWord: true,
    });

    const fit     = new FitAddon();
    const links   = new WebLinksAddon();
    const unicode = new Unicode11Addon();
    const search  = new SearchAddon();
    term.loadAddon(unicode); term.unicode.activeVersion = "11";
    term.loadAddon(fit);
    term.loadAddon(links);
    term.loadAddon(search);
    term.open(containerRef.current);
    termRef.current   = term;
    fitRef.current    = fit;
    searchRef.current = search;
    rOnAddon.current(search);
    rOnTermReady.current(term);

    // ── OSC handlers — store disposables so we can clean up on unmount ─────
    oscDisposables.current.push(
      term.parser.registerOscHandler(0, (data) => { rOnTitle.current(data); return true; }),
      term.parser.registerOscHandler(2, (data) => { rOnTitle.current(data); return true; }),
      term.parser.registerOscHandler(7, (data) => {
        try {
          const url = new URL(data);
          rOnCwd.current(shortPath(decodeURIComponent(url.pathname)));
        } catch { /* malformed */ }
        return true;
      }),
      term.parser.registerOscHandler(133, (data) => {
        if (data.startsWith("D;")) {
          const code = parseInt(data.slice(2), 10);
          if (!isNaN(code)) rOnExitCode.current(code);
        }
        return true;
      }),
    );

    // ── Keyboard handling ──────────────────────────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && (e.key === "=" || e.key === "+")) { rOnZoom.current(+1);  return false; }
      if (meta && e.key === "-")                    { rOnZoom.current(-1);  return false; }
      if (meta && e.key === "w") { rOnClose.current(); return false; }
      if (meta && e.key === "t") { window.dispatchEvent(new CustomEvent("nova:new-terminal")); return false; }
      if (meta && e.key === "d") { rOnSplit.current(); return false; }

      if (meta && e.key === "c") {
        const sel = termRef.current?.getSelection();
        if (sel) { navigator.clipboard.writeText(sel); return false; }
        return true; // fall through → SIGINT
      }
      if (meta && e.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text) invoke("pty_write", { sessionId: session.id, data: text }).catch(() => {});
        });
        return false;
      }
      if (meta && e.key === "k") {
        termRef.current?.clear();
        invoke("pty_write", { sessionId: session.id, data: "clear\r" }).catch(() => {});
        return false;
      }
      if (meta && e.key === "f") {
        window.dispatchEvent(new CustomEvent("nova:terminal-search"));
        return false;
      }
      return true;
    });

    // User input → PTY
    term.onData((data) => invoke("pty_write", { sessionId: session.id, data }).catch(() => {}));

    // ResizeObserver → refit.
    // Guard: skip if the container has no size (display:none) to prevent
    // sending a 0×0 resize to the PTY which corrupts line-wrapping.
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!fitRef.current || !termRef.current || !container) return;
        if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
        fitRef.current.fit();
        const { rows, cols } = termRef.current;
        invoke("pty_resize", { sessionId: session.id, rows, cols }).catch(() => {});
      });
    });
    ro.observe(containerRef.current);
    roRef.current = ro;

    // PTY output → xterm
    listen<string>(`pty-output-${session.id}`, (ev) => termRef.current?.write(ev.payload))
      .then((fn) => { unlistenRef.current = fn; });

    // Fit and spawn AFTER fonts are ready so we get accurate dimensions.
    // This is the fix for the "wrong cols on spawn" bug where the PTY was
    // started with xterm's uninitialised 80×24 instead of the actual size.
    document.fonts.ready.then(() => {
      if (!fitRef.current || !termRef.current) return;
      fitRef.current.fit();
      if (focused) termRef.current.focus();
      const { rows, cols } = termRef.current;
      invoke("pty_spawn", {
        sessionId: session.id,
        cwd:       initCwd,
        rows, cols,
        shell:     session.shell || null,
      }).catch((err) => {
        termRef.current?.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, visible]);

  // Refit + refocus whenever display/focus/height changes
  useEffect(() => {
    if (hidden || !visible || !inited.current) return;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!fitRef.current || !termRef.current || !container) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      fitRef.current.fit();
      const { rows, cols } = termRef.current;
      invoke("pty_resize", { sessionId: session.id, rows, cols }).catch(() => {});
      if (focused) termRef.current.focus();
    });
  }, [hidden, focused, visible, height, session.id]);

  // Live font update
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize   = fontSize;
    term.options.lineHeight = lineHeight;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      if (termRef.current) {
        const { rows, cols } = termRef.current;
        invoke("pty_resize", { sessionId: session.id, rows, cols }).catch(() => {});
      }
    });
  }, [fontSize, lineHeight, session.id]);

  // Live theme update
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTermTheme(themeName);
  }, [themeName]);

  // Search visibility
  useEffect(() => {
    if (!showSearch) {
      searchRef.current?.clearDecorations();
      if (focused) termRef.current?.focus();
    }
  }, [showSearch, focused]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 min-w-0"
      style={{ display: (!hidden && visible) ? "block" : "none", overflow: "hidden" }}
    />
  );
}

// ── Shell-selector dropdown ───────────────────────────────────────────────────
function ShellMenu({
  shells, onSelect, onClose,
}: { shells: string[]; onSelect: (s: string) => void; onClose: () => void; }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref}
         className="absolute top-full left-0 mt-0.5 z-50 py-1 rounded-lg border border-editor-border shadow-2xl fade-in"
         style={{ minWidth: 180, background: "rgb(var(--c-sidebar))" }}>
      {shells.map((s) => (
        <button key={s} onClick={() => { onSelect(s); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-editor-fg hover:bg-white/[0.06] transition-colors">
          <ChevronRight size={10} className="text-editor-comment" />
          {shellName(s)} <span className="text-editor-comment ml-1 truncate text-2xs">{s}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main Terminal panel ───────────────────────────────────────────────────────
interface TerminalProps { visible: boolean }

export function Terminal({ visible }: TerminalProps) {
  const toggle         = useStore((s) => s.toggleTerminal);
  const workspaceRoot  = useStore((s) => s.workspaceRoot);
  const termSettings   = useStore((s) => s.settings.terminal);
  const updateSettings = useStore((s) => s.updateSettings);
  const themeName      = useStore((s) => s.settings.editor.theme);

  const [shells,       setShells]       = useState<string[]>([]);
  const [sessions,     setSessions]     = useState<Session[]>([]);
  // mainActiveId: which tab is selected in the left pane.
  // Never equals splitId — they are independent.
  const [mainActiveId, setMainActiveId] = useState<string>("");
  const [splitId,      setSplitId]      = useState<string | null>(null);
  // splitFocused: whether keyboard focus is in the right split pane.
  const [splitFocused, setSplitFocused] = useState(false);

  // Stable refs so callbacks can always read current values without stale closures.
  const splitIdRef      = useRef<string | null>(null);
  const mainActiveIdRef = useRef<string>("");
  const sessionsRef     = useRef<Session[]>([]);
  splitIdRef.current      = splitId;
  mainActiveIdRef.current = mainActiveId;
  sessionsRef.current     = sessions;
  const [height,       setHeight]       = useState(260);
  const [maximized,    setMaximized]    = useState(false);
  const [renamingId,   setRenamingId]   = useState<string | null>(null);
  const [renameVal,    setRenameVal]    = useState("");
  const [showSearch,   setShowSearch]   = useState(false);
  const [shellMenu,    setShellMenu]    = useState(false);
  const [ctxMenu,      setCtxMenu]      = useState<{ x: number; y: number } | null>(null);
  const [searchAddons, setSearchAddons] = useState<Record<string, SearchAddon>>({});
  const renameRef = useRef<HTMLInputElement>(null);

  const cwd    = workspaceRoot || ".";
  const maxH   = Math.floor(window.innerHeight * 0.7);
  const panelH = maximized ? maxH : height;

  // The session that currently owns keyboard focus (for context menu / clear)
  const focusedSessionId = splitFocused && splitId ? splitId : mainActiveId;

  const zoom = useCallback((d: number) => {
    updateSettings({ terminal: { fontSize: Math.max(8, Math.min(32, termSettings.fontSize + d)) } });
  }, [termSettings.fontSize, updateSettings]);

  // Load available shells
  useEffect(() => {
    invoke<string[]>("get_shells").then(setShells).catch(() => setShells(["/bin/zsh"]));
  }, []);

  // Create initial session after shells load — guarded by a ref so it runs exactly once
  // even if `shells` changes identity (e.g. React Strict Mode double-invoke).
  const hasCreatedInitial = useRef(false);
  useEffect(() => {
    if (hasCreatedInitial.current || shells.length === 0) return;
    hasCreatedInitial.current = true;
    const id = crypto.randomUUID();
    const s: Session = { id, shell: shells[0], label: "", title: "", cwd: "", exitCode: null };
    setSessions([s]);
    setMainActiveId(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shells]);

  const makeSession = useCallback((shell?: string): Session => ({
    id:       crypto.randomUUID(),
    shell:    shell ?? shells[0] ?? "/bin/zsh",
    label:    "",
    title:    "",
    cwd:      "",
    exitCode: null,
  }), [shells]);

  const addSession = useCallback((shell?: string) => {
    const s = makeSession(shell);
    const currentSplitId = splitIdRef.current;
    // When there's a split open, remove that session entirely so it doesn't
    // become a zombie hidden tab. Its TerminalPane will unmount → cleanup kills PTY.
    setSessions((p) => {
      const base = currentSplitId ? p.filter((x) => x.id !== currentSplitId) : p;
      return [...base, s];
    });
    if (currentSplitId) {
      setSearchAddons((p) => { const n = { ...p }; delete n[currentSplitId]; return n; });
      delete termRef_map.current[currentSplitId];
      setSplitId(null);
      setSplitFocused(false);
    }
    setMainActiveId(s.id);
    return s.id;
  }, [makeSession]);

  const splitTerminal = useCallback((shell?: string) => {
    const s = makeSession(shell);
    setSessions((p) => [...p, s]);
    setSplitId(s.id);
    // Left pane keeps its selection; right pane starts focused.
    setSplitFocused(true);
  }, [makeSession]);

  // Flag set by removeSession when the last session is closed; a separate effect
  // calls toggle() outside of the setSessions updater (safe for Concurrent mode).
  const shouldClosePanel = useRef(false);
  useEffect(() => {
    if (shouldClosePanel.current) { shouldClosePanel.current = false; toggle(); }
  });

  const removeSession = useCallback((id: string) => {
    delete termRef_map.current[id];
    setSearchAddons((p) => { const next = { ...p }; delete next[id]; return next; });

    // Capture current values via refs so this callback never goes stale.
    const curSplitId      = splitIdRef.current;
    const curMainActiveId = mainActiveIdRef.current;

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);

      if (next.length === 0) {
        // Last session closed — close the panel after this render.
        shouldClosePanel.current = true;
        return prev; // keep sessions so the pane doesn't flash empty before toggle
      }

      if (id === curSplitId) {
        // Closed the split pane
        setSplitId(null);
        setSplitFocused(false);
      } else if (id === curMainActiveId) {
        // Closed the active main tab — pick next tab (exclude split from candidates)
        const nonSplit = next.filter((s) => s.id !== curSplitId);
        if (nonSplit.length > 0) {
          setMainActiveId(nonSplit.at(-1)!.id);
        } else if (curSplitId) {
          // Only the split remains — promote it to main and close split
          setMainActiveId(curSplitId);
          setSplitId(null);
          setSplitFocused(false);
        }
      }
      return next;
    });
  // deps are empty: all state is read via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSession = useCallback((id: string, patch: Partial<Session>) => {
    setSessions((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
  }, []);

  // New workspace → new session.
  // sessions.length is intentionally NOT a dep — it caused the effect to re-fire
  // every time a session was added, which triggered spurious second sessions on startup.
  // We use sessionsRef to read the current count without making it a dependency.
  const prevRoot = useRef("");
  useEffect(() => {
    if (!workspaceRoot) return;
    const changed = prevRoot.current !== "" && prevRoot.current !== workspaceRoot;
    prevRoot.current = workspaceRoot;
    if (changed && sessionsRef.current.length > 0) addSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, addSession]);

  // nova:new-terminal event (Cmd+T from keyboard handler inside pane)
  useEffect(() => {
    const h = () => addSession();
    window.addEventListener("nova:new-terminal", h);
    return () => window.removeEventListener("nova:new-terminal", h);
  }, [addSession]);

  // nova:terminal-search event (Cmd+F from keyboard handler inside pane)
  useEffect(() => {
    const h = () => setShowSearch(true);
    window.addEventListener("nova:terminal-search", h);
    return () => window.removeEventListener("nova:terminal-search", h);
  }, []);

  // Ctrl+Shift+F — global search toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        if (document.activeElement?.closest?.(".xterm")) {
          e.preventDefault(); setShowSearch((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Rename
  useEffect(() => {
    if (renamingId) setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 0);
  }, [renamingId]);
  const commitRename = () => {
    if (!renamingId) return;
    const v = renameVal.trim();
    if (v) updateSession(renamingId, { label: v });
    setRenamingId(null);
  };

  // Drag resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    const sy = e.clientY; const sh = height;
    const onMove = (ev: MouseEvent) => setHeight(Math.max(120, Math.min(700, sh + (sy - ev.clientY))));
    const onUp   = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height, maximized]);

  // Clear the focused terminal
  const clearActive = useCallback(() => {
    invoke("pty_write", { sessionId: focusedSessionId, data: "clear\r" }).catch(() => {});
  }, [focusedSessionId]);

  // Map to expose XTerm instances for context menu copy/paste
  const termRef_map = useRef<Record<string, XTerm | null>>({});

  const buildCtxItems = useCallback((): CtxItem[] => [
    {
      label: "Copy",
      action: () => {
        const s = termRef_map.current[focusedSessionId]?.getSelection();
        if (s) navigator.clipboard.writeText(s);
      },
    },
    {
      label: "Paste",
      action: () => {
        navigator.clipboard.readText().then((t) => {
          if (t) invoke("pty_write", { sessionId: focusedSessionId, data: t }).catch(() => {});
        });
      },
    },
    { label: "Select All", action: () => termRef_map.current[focusedSessionId]?.selectAll() },
    { label: "Clear", icon: <Trash2 size={11}/>, action: () => invoke("pty_write", { sessionId: focusedSessionId, data: "clear\r" }).catch(() => {}) },
    { label: "Split Pane", icon: <SplitSquareHorizontal size={11}/>, action: () => splitTerminal() },
  ], [focusedSessionId, splitTerminal]);

  const mainSessions = sessions.filter((s) => s.id !== splitId);
  const splitSession = sessions.find((s)  => s.id === splitId);

  const tabLabel = (s: Session, i: number) => {
    if (s.label) return s.label;
    const base = s.title || shellName(s.shell);
    const dir  = s.cwd ? ` · ${s.cwd}` : (mainSessions.length > 1 ? ` ${i + 1}` : "");
    return base + dir;
  };

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        height:    panelH,
        display:   visible ? "flex" : "none",
        background: "rgb(var(--c-deep) / var(--surface-alpha, 1))",
        borderTop: "1px solid rgb(var(--c-border))",
        transition: "height 0.12s ease",
      }}
    >
      {/* ── Drag handle ─────────────────────────────────────────────────── */}
      <div
        onMouseDown={onDragStart}
        className="h-[3px] shrink-0 group"
        style={{ cursor: maximized ? "default" : "ns-resize", background: "rgb(var(--c-border))" }}
      >
        <div className="h-full w-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgb(var(--c-accent))" }} />
      </div>

      {/* ── Header / Tab bar ────────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0 select-none"
        style={{ height: 36, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))", borderBottom: "1px solid rgb(var(--c-border))" }}
      >
        {/* Session tabs */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0 h-full" style={{ scrollbarWidth: "none" }}>
          {mainSessions.map((s, i) => {
            const isAct = s.id === mainActiveId;
            return (
              <div
                key={s.id}
                onClick={() => { setMainActiveId(s.id); setSplitFocused(false); }}
                onDoubleClick={() => { setRenamingId(s.id); setRenameVal(s.label); }}
                className="group/tab relative flex items-center gap-1.5 h-full cursor-pointer select-none shrink-0 border-r border-editor-border transition-colors"
                style={{
                  padding:    "0 10px 0 12px",
                  background: isAct ? "rgb(var(--c-bg) / var(--surface-alpha, 1))" : "transparent",
                  color:      isAct ? "rgb(var(--c-fg))" : "rgb(var(--c-comment))",
                  fontSize:   11,
                  fontFamily: "'JetBrains Mono', monospace",
                  minWidth:   0,
                  maxWidth:   200,
                }}
              >
                {/* Exit code indicator */}
                {s.exitCode !== null && (
                  s.exitCode === 0
                    ? <CheckCircle2 size={9} className="shrink-0 text-editor-green" />
                    : <XCircle size={9} className="shrink-0 text-editor-red" />
                )}
                {/* Activity dot */}
                {s.exitCode === null && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: isAct ? "rgb(var(--c-green))" : "rgb(var(--c-border))",
                    transition: "background 0.2s",
                  }} />
                )}

                {renamingId === s.id ? (
                  <input
                    ref={renameRef} value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if(e.key==="Enter"){ e.preventDefault(); commitRename(); } if(e.key==="Escape") setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-24 bg-transparent outline-none text-editor-fg"
                    style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                ) : (
                  <span className="truncate">{tabLabel(s, i)}</span>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                  className="opacity-0 group-hover/tab:opacity-60 hover:!opacity-100 transition-opacity rounded hover:text-editor-red flex items-center shrink-0 ml-1"
                  title="Close (⌘W)"
                >
                  <X size={9} />
                </button>
              </div>
            );
          })}

          {/* New session button with shell dropdown */}
          <div className="relative shrink-0 flex items-center h-full">
            <button
              onClick={() => addSession()}
              className="flex items-center justify-center w-8 h-full transition-colors hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg"
              title="New terminal (⌘T)"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => setShellMenu((v) => !v)}
              className="flex items-center justify-center w-5 h-full transition-colors hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg"
              title="Select shell profile"
            >
              <ChevronDown size={10} />
            </button>
            {shellMenu && shells.length > 0 && (
              <ShellMenu
                shells={shells}
                onSelect={(sh) => addSession(sh)}
                onClose={() => setShellMenu(false)}
              />
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center shrink-0 gap-0.5 pr-1.5">
          <button onClick={() => setShowSearch((v) => !v)} title="Search (⌘F)"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${showSearch ? "bg-editor-accent/15 text-editor-accent" : "hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg"}`}>
            <Search size={12} />
          </button>
          <button onClick={clearActive} title="Clear (⌘K)"
            className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg">
            <Trash2 size={12} />
          </button>
          <button onClick={() => splitTerminal()} title="Split pane (⌘D)"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${splitId ? "bg-editor-accent/15 text-editor-accent" : "hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg"}`}>
            <SplitSquareHorizontal size={12} />
          </button>
          <button onClick={() => setMaximized((v) => !v)} title={maximized ? "Restore" : "Maximize"}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg">
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={toggle} title="Hide terminal (⌘J)"
            className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-white/[0.06] text-editor-comment hover:text-editor-fg">
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* ── Pane area ───────────────────────────────────────────────────── */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden relative"
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {/* Search overlay — bound to the focused pane's SearchAddon */}
        {showSearch && (
          <SearchBar
            addon={searchAddons[focusedSessionId] ?? null}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* ── Left pane: tab-switched main sessions ──────────────────────── */}
        {/* All sessions are mounted so switching tabs is instant.           */}
        {/* Only the mainActiveId session has hidden=false (visible).        */}
        {/* Clicking anywhere here returns focus to the main pane.           */}
        <div
          className="flex flex-col min-h-0 overflow-hidden"
          style={{ flex: splitId ? "0 0 50%" : "1 1 100%" }}
          onMouseDown={() => { if (splitFocused) setSplitFocused(false); }}
        >
          {mainSessions.map((s) => (
            <TerminalPane
              key={s.id}
              session={s}
              hidden={s.id !== mainActiveId}
              focused={!splitFocused && s.id === mainActiveId}
              visible={visible}
              height={panelH}
              initCwd={cwd}
              fontSize={termSettings.fontSize}
              lineHeight={termSettings.lineHeight}
              scrollback={termSettings.scrollback}
              themeName={themeName}
              showSearch={showSearch && s.id === focusedSessionId}
              onHideSearch={() => setShowSearch(false)}
              onAddonReady={(a) => setSearchAddons((p) => ({ ...p, [s.id]: a }))}
              onTermReady={(t) => { termRef_map.current[s.id] = t; }}
              onTitle={(t) => updateSession(s.id, { title: t, exitCode: null })}
              onCwd={(d) => updateSession(s.id, { cwd: d })}
              onExitCode={(c) => updateSession(s.id, { exitCode: c })}
              onZoom={zoom}
              onClose={() => removeSession(s.id)}
              onSplit={() => splitTerminal()}
            />
          ))}
          {/* Placeholder shown when no main sessions exist (shouldn't happen normally) */}
          {mainSessions.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-editor-comment text-xs">No terminal sessions</div>
          )}
        </div>

        {/* ── Right pane: split terminal ─────────────────────────────────── */}
        {/* Clicking here gives keyboard focus to the split without hiding   */}
        {/* the left pane — mainActiveId stays unchanged.                    */}
        {splitId && splitSession && (
          <>
            <div className="w-[1px] shrink-0" style={{ background: "rgb(var(--c-border))" }} />
            <div
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
              onMouseDown={() => { if (!splitFocused) setSplitFocused(true); }}
            >
              {/* Split mini-header */}
              <div
                className="flex items-center justify-between shrink-0 px-3 border-b border-editor-border"
                style={{
                  height:     24,
                  background: splitFocused
                    ? "rgb(var(--c-bg) / var(--surface-alpha, 1))"
                    : "rgb(var(--c-deep) / var(--surface-alpha, 1))",
                  fontSize:   10,
                  color:      "rgb(var(--c-comment))",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: splitFocused ? "rgb(var(--c-green))" : "rgb(var(--c-border))",
                  }} />
                  {splitSession.title || shellName(splitSession.shell)}
                  {splitSession.cwd ? ` · ${splitSession.cwd}` : ""}
                </span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeSession(splitSession.id)}
                  className="text-editor-comment hover:text-editor-red transition-colors"
                >
                  <X size={9} />
                </button>
              </div>
              <TerminalPane
                key={splitSession.id}
                session={splitSession}
                hidden={false}
                focused={splitFocused}
                visible={visible}
                height={panelH}
                initCwd={cwd}
                fontSize={termSettings.fontSize}
                lineHeight={termSettings.lineHeight}
                scrollback={termSettings.scrollback}
                themeName={themeName}
                showSearch={showSearch && splitFocused}
                onHideSearch={() => setShowSearch(false)}
                onAddonReady={(a) => setSearchAddons((p) => ({ ...p, [splitSession.id]: a }))}
                onTermReady={(t) => { termRef_map.current[splitSession.id] = t; }}
                onTitle={(t) => updateSession(splitSession.id, { title: t, exitCode: null })}
                onCwd={(d) => updateSession(splitSession.id, { cwd: d })}
                onExitCode={(c) => updateSession(splitSession.id, { exitCode: c })}
                onZoom={zoom}
                onClose={() => removeSession(splitSession.id)}
                onSplit={() => { /* nested split not supported */ }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Context menu ────────────────────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          items={buildCtxItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}

    </div>
  );
}
