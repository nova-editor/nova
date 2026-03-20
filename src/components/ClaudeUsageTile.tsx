import { useState, useRef, useEffect, useCallback } from "react";
import { X, ExternalLink, RefreshCw } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { AnthropicLogo } from "./AiLogos";
import { useStore } from "../store";

// ── Panel-aware safe home ──────────────────────────────────────────────────────

const GAP    = 8;
const TILE_W = 320;   // exact match with SpotifyPlayer

function safeHome(
  showTerminal: boolean, showGitPanel: boolean,
  showFileTree: boolean, showSettings: boolean, showHelp: boolean,
  sidebarWidth: number, terminalHeight: number, gitPanelWidth: number,
): { x: number; y: number } {
  const rightOff  = Math.max(showGitPanel ? gitPanelWidth : 0, (showSettings || showHelp) ? 312 : 0);
  const bottomOff = showTerminal ? terminalHeight + 24 : 0;
  const tileRight  = rightOff  > 0 ? window.innerWidth  - rightOff  - GAP : window.innerWidth  - 20;
  const tileBottom = bottomOff > 0 ? window.innerHeight - bottomOff - GAP : window.innerHeight - 20;
  return {
    x: Math.max(showFileTree ? sidebarWidth + GAP : 0, tileRight - TILE_W),
    y: Math.max(60, tileBottom - 360),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function IBtn({ onClick, title, children, comment }: {
  onClick: () => void; title?: string;
  children: React.ReactNode; comment: string;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", cursor: "pointer",
      color: comment, padding: "2px 4px", borderRadius: 4,
      display: "flex", alignItems: "center",
    }}>
      {children}
    </button>
  );
}

// ── Stats cache types ──────────────────────────────────────────────────────────

interface DayActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

interface DayTokens {
  date: string;
  tokensByModel: Record<string, number>;
}

interface ClaudeStats {
  dailyActivity:    DayActivity[];
  dailyModelTokens: DayTokens[];
  totalSessions:    number;
  totalMessages:    number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ClaudeUsageTile({ onClose }: { onClose: () => void }) {
  const sessionUsage       = useStore((s) => s.claudeSessionUsage);
  const spotifyTransparent = useStore((s) => s.settings.spotifyTransparent);
  const showTerminal       = useStore((s) => s.showTerminal);
  const showGitPanel       = useStore((s) => s.showGitPanel);
  const showFileTree       = useStore((s) => s.showFileTree);
  const showSettings       = useStore((s) => s.showSettings);
  const showHelp           = useStore((s) => s.showHelp);
  const sidebarWidth       = useStore((s) => s.settings.sidebarWidth);
  const terminalHeight     = useStore((s) => s.terminalHeight);
  const gitPanelWidth      = useStore((s) => s.gitPanelWidth);

  const [stats, setStats]     = useState<ClaudeStats | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const raw = await invoke<string>("read_claude_stats");
      const parsed = JSON.parse(raw) as ClaudeStats;
      setStats(parsed);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const getSafeHome = useCallback(
    () => safeHome(showTerminal, showGitPanel, showFileTree, showSettings, showHelp, sidebarWidth, terminalHeight, gitPanelWidth),
    [showTerminal, showGitPanel, showFileTree, showSettings, showHelp, sidebarWidth, terminalHeight, gitPanelWidth],
  );

  const [pos, setPos]    = useState(() => getSafeHome());
  const offsetRef        = useRef({ x: 0, y: 0 });
  const targetRef        = useRef<{ x: number; y: number }>(null!);
  if (!targetRef.current) targetRef.current = getSafeHome();
  const velRef           = useRef({ x: 0, y: 0 });
  const rafRef           = useRef(0);
  const animatingRef     = useRef(false);

  // Exact same iOS-style spring as SpotifyPlayer
  const startLoop = useCallback((forceRestart = false) => {
    if (animatingRef.current && !forceRestart) return;
    cancelAnimationFrame(rafRef.current);
    animatingRef.current = true;
    const stiffness = 0.14;
    const damping   = 0.78;
    const loop = () => {
      setPos(cur => {
        const dx = targetRef.current.x - cur.x;
        const dy = targetRef.current.y - cur.y;
        velRef.current.x = velRef.current.x * damping + dx * stiffness;
        velRef.current.y = velRef.current.y * damping + dy * stiffness;
        const nx = cur.x + velRef.current.x;
        const ny = cur.y + velRef.current.y;
        const settled = Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 &&
                        Math.abs(velRef.current.x) < 0.1 && Math.abs(velRef.current.y) < 0.1;
        if (settled) { animatingRef.current = false; return targetRef.current; }
        rafRef.current = requestAnimationFrame(loop);
        return { x: nx, y: ny };
      });
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => { targetRef.current = getSafeHome(); startLoop(); }, [getSafeHome, startLoop]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    targetRef.current = getSafeHome();
    startLoop(true);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    e.preventDefault();
    cancelAnimationFrame(rafRef.current);
    animatingRef.current = false;
    velRef.current = { x: 0, y: 0 };
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      targetRef.current = { x: ev.clientX - offsetRef.current.x, y: ev.clientY - offsetRef.current.y };
      startLoop(true);
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  // ── Color system — mirrors SpotifyPlayer exactly ───────────────────────────
  const bg      = spotifyTransparent ? "transparent"            : "rgb(var(--c-deep) / 0.97)";
  const surface = spotifyTransparent ? "rgba(255,255,255,0.04)" : "rgb(var(--c-sidebar) / 0.5)";
  const border  = spotifyTransparent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)";
  const fg      = "rgb(var(--c-fg))";
  const comment = spotifyTransparent ? "rgba(255,255,255,0.5)"  : "rgb(var(--c-comment))";
  const accent  = "#D97757";

  // ── Build 7-day data from stats cache ─────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const days: { date: string; label: string; tokens: number; msgs: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);

    const tokEntry = stats?.dailyModelTokens.find((x) => x.date === key);
    const tokens   = tokEntry ? Object.values(tokEntry.tokensByModel).reduce((a, b) => a + b, 0) : 0;

    const actEntry = stats?.dailyActivity.find((x) => x.date === key);
    const msgs     = actEntry?.messageCount ?? 0;

    days.push({
      date:  key,
      label: d.toLocaleDateString("en", { weekday: "short" }).slice(0, 1),
      tokens,
      msgs,
    });
  }
  const maxTokens   = Math.max(1, ...days.map((d) => d.tokens));
  const todayDay    = days[days.length - 1];
  const weekTokens  = days.reduce((s, d) => s + d.tokens, 0);
  const weekMsgs    = days.reduce((s, d) => s + d.msgs, 0);
  const sessionTotal = sessionUsage.input + sessionUsage.output;

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
        width: TILE_W, cursor: "grab", userSelect: "none",
        background: bg,
        backdropFilter: spotifyTransparent ? "blur(20px) saturate(1.4)" : "blur(32px) saturate(2)",
        WebkitBackdropFilter: spotifyTransparent ? "blur(20px) saturate(1.4)" : "blur(32px) saturate(2)",
        border: `1px solid ${border}`,
        borderRadius: 16, overflow: "hidden",
        boxShadow: spotifyTransparent ? "0 8px 32px rgba(0,0,0,0.4)" : "0 20px 60px rgba(0,0,0,0.65)",
        fontFamily: "'JetBrains Mono', monospace", color: fg,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px 8px", gap: 5 }}>
        <AnthropicLogo size={13} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: comment }}>CLAUDE</span>
        <IBtn comment={comment} title="Refresh stats"
          onClick={loadStats}>
          <RefreshCw size={11} />
        </IBtn>
        <IBtn comment={comment} title="View full usage on claude.ai"
          onClick={() => openUrl("https://claude.ai/settings/usage").catch(() => {})}>
          <ExternalLink size={11} />
        </IBtn>
        <IBtn comment={comment} onClick={onClose} title="Close"><X size={13} /></IBtn>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "4px 14px 16px" }}>

        {/* Session tokens */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: fg, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {fmt(sessionTotal)}
          </span>
          <span style={{ fontSize: 10, color: comment, opacity: 0.7 }}>tokens · session</span>
        </div>

        {/* In / Out / Cache cards */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
          {[
            { label: "input",  val: sessionUsage.input,  color: "rgba(100,180,255,0.85)" },
            { label: "output", val: sessionUsage.output, color: accent },
            { label: "cache",  val: sessionUsage.cache,  color: "rgba(140,200,120,0.75)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              flex: 1, padding: "7px 8px", borderRadius: 8,
              background: surface,
              border: `1px solid ${border}`,
              display: "flex", flexDirection: "column", gap: 3, alignItems: "center",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: "-0.02em" }}>
                {fmt(val)}
              </span>
              <span style={{ fontSize: 8, color: comment, textTransform: "uppercase", letterSpacing: "0.07em", opacity: 0.7 }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: border, marginBottom: 12 }} />

        {/* 7-day stats from stats-cache */}
        {loadErr ? (
          <div style={{ fontSize: 9, color: comment, opacity: 0.5, textAlign: "center", marginBottom: 10 }}>
            stats unavailable · claude CLI not found
          </div>
        ) : (
          <>
            {/* Today + week summary */}
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              <div style={{
                flex: 1, padding: "6px 8px", borderRadius: 8,
                background: surface, border: `1px solid ${border}`,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{fmt(todayDay.tokens)}</span>
                <span style={{ fontSize: 8, color: comment, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.07em" }}>today tok</span>
              </div>
              <div style={{
                flex: 1, padding: "6px 8px", borderRadius: 8,
                background: surface, border: `1px solid ${border}`,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: fg }}>{todayDay.msgs}</span>
                <span style={{ fontSize: 8, color: comment, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.07em" }}>today msg</span>
              </div>
              <div style={{
                flex: 1, padding: "6px 8px", borderRadius: 8,
                background: surface, border: `1px solid ${border}`,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: fg }}>{weekMsgs}</span>
                <span style={{ fontSize: 8, color: comment, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.07em" }}>week msg</span>
              </div>
            </div>

            {/* 7-day token bar chart */}
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 40, marginBottom: 4 }}>
              {days.map((d) => {
                const h = d.tokens > 0 ? Math.max(4, Math.round((d.tokens / maxTokens) * 40)) : 2;
                const isToday = d.date === today;
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: "100%", height: h, borderRadius: 2,
                      background: isToday ? accent : border,
                      boxShadow: isToday ? `0 0 8px ${accent}55` : "none",
                      transition: "height 0.3s ease",
                    }} />
                    <span style={{
                      fontSize: 8, color: isToday ? accent : comment,
                      opacity: isToday ? 1 : 0.5,
                    }}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 8.5, color: comment, opacity: 0.4, textAlign: "right", marginBottom: 2 }}>
              {fmt(weekTokens)} tok · 7 days
            </div>
          </>
        )}

        {/* Footer note */}
        <div style={{ marginTop: 6, fontSize: 8, color: comment, opacity: 0.3, textAlign: "center" }}>
          nova session · ↗ for account limits & cost
        </div>
      </div>
    </div>
  );
}
