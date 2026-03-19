import { useEffect, useRef, useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { Play, Pause, SkipBack, SkipForward, Search, X, Music, Volume2 } from "lucide-react";

// ── osascript ─────────────────────────────────────────────────────────────────

async function as(script: string): Promise<string> {
  return invoke<string>("spotify_osascript", { script });
}

async function spotifyRunning(): Promise<boolean> {
  try {
    const r = await as(`tell application "System Events" to return (name of processes) contains "Spotify"`);
    return r.trim() === "true";
  } catch { return false; }
}

interface SpotifyState {
  name: string; artist: string; album: string; art: string;
  duration: number; playing: boolean; position: number; volume: number;
}

async function getSpotifyState(): Promise<SpotifyState | null> {
  try {
    const [meta, pos, vol] = await Promise.all([
      as(`tell application "Spotify"
            set t to current track
            return (name of t) & "\t" & (artist of t) & "\t" & (album of t) & "\t" & (artwork url of t) & "\t" & (duration of t as integer) & "\t" & (player state as string)
          end tell`),
      as(`tell application "Spotify" to return player position as integer`),
      as(`tell application "Spotify" to return sound volume as integer`),
    ]);
    const [name, artist, album, art, durRaw, stateStr] = meta.split("\t");
    const duration = Math.max(1, Number(durRaw));
    return {
      name, artist, album, art: art?.trim() ?? "",
      duration: duration > 10000 ? Math.round(duration / 1000) : duration,
      playing: stateStr?.trim() === "playing",
      position: Number(pos), volume: Number(vol),
    };
  } catch { return null; }
}

// ── Visualizer ────────────────────────────────────────────────────────────────

const BAR_COUNT = 42;

function getAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--c-accent").trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 ? [parts[0], parts[1], parts[2]] : [29, 185, 84];
}

const Visualizer = memo(function Visualizer({ playing, spMode }: { playing: boolean; spMode: SpMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, (_, i) => ({
      h: 0.04, target: 0.04,
      phase: Math.random() * Math.PI * 2,
      freq:  0.7 + (i / BAR_COUNT) * 1.8,
    }))
  );
  const raf = useRef(0);
  const t   = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    const tick = () => {
      t.current += 0.016;
      ctx.clearRect(0, 0, W, H);

      const [r, g, b] = spMode === "spotify" ? [29, 185, 84]
                      : spMode === "white"   ? [255, 255, 255]
                      : getAccentRgb();
      const barW = W / BAR_COUNT;

      bars.current.forEach((bar, i) => {
        if (playing) {
          const base = Math.sin(t.current * bar.freq + bar.phase) * 0.5 + 0.5;
          const kick = Math.max(0, Math.sin(t.current * 1.05)) * 0.3;
          const hi   = Math.abs(Math.sin(t.current * 5.5 + i * 0.3)) * 0.15;
          bar.target = 0.06 + base * 0.65 + kick + hi;
        } else {
          bar.target = 0.03 + Math.abs(Math.sin(t.current * 0.35 + i * 0.2)) * 0.03;
        }
        bar.h += (bar.target - bar.h) * (playing ? 0.13 : 0.05);

        const bH = bar.h * H;
        const x  = i * barW + barW * 0.18;
        const w  = barW * 0.64;
        const y  = H - bH;

        const grad = ctx.createLinearGradient(0, y, 0, H);
        const alpha = playing ? 0.9 : 0.18;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.04)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, bH, 2);
        ctx.fill();
      });

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, spMode]);

  return (
    <canvas ref={canvasRef} width={320} height={56}
      style={{ display: "block", width: "100%", height: 56 }} />
  );
});

// ── Spotify hard-coded theme vars ─────────────────────────────────────────────

type SpMode = "editor" | "spotify" | "white";

const SP_DARK = {
  bg: "#121212", surface: "#181818", border: "#282828",
  fg: "#FFFFFF",  comment: "#B3B3B3", muted: "#535353",
  accent: "#1DB954", deep: "#000000",
};

// "white" mode = editor theme but accent forced to white


// ── Component ────────────────────────────────────────────────────────────────

export function SpotifyPlayer({ onClose }: { onClose: () => void }) {
  const [state,       setState]      = useState<SpotifyState | null>(null);
  const [notRunning,  setNotRunning] = useState(false);
  const [query,       setQuery]      = useState("");
  const [showSearch,  setShowSearch] = useState(false);
  const [spMode, setSpMode] = useState<SpMode>(() => {
    const saved = localStorage.getItem("sp-theme");
    return (saved === "editor" || saved === "spotify" || saved === "white") ? saved : "editor";
  });
  const spotifyTransparent = useStore((s) => s.settings.spotifyTransparent);
  const DEFAULT_POS = { x: window.innerWidth - 340, y: window.innerHeight - 320 };
  const [pos, setPos] = useState(DEFAULT_POS);
  const offsetRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: pos.x, y: pos.y });
  const velRef    = useRef({ x: 0, y: 0 });
  const rafRef    = useRef(0);

  const cycleMode = () => setSpMode(m => {
    const next: SpMode = m === "editor" ? "spotify" : m === "spotify" ? "white" : "editor";
    localStorage.setItem("sp-theme", next);
    return next;
  });

  const T = spMode === "spotify" ? SP_DARK : null;
  const isWhite = spMode === "white";

  // transparent toggle always wins for surfaces/backgrounds
  const bg      = spotifyTransparent ? "transparent"                : T ? T.bg      : "rgb(var(--c-deep) / 0.97)";
  const surface = spotifyTransparent ? "transparent"                : T ? T.surface : "rgb(var(--c-sidebar) / 0.5)";
  const border  = spotifyTransparent ? "rgba(255,255,255,0.15)"     : T ? T.border  : isWhite ? "rgba(255,255,255,0.12)" : "rgb(var(--c-border) / 0.35)";

  // accent / text colors still follow SP mode
  const fg      = T ? T.fg      : isWhite ? "#FFFFFF"                                                      : "rgb(var(--c-fg))";
  const comment = T ? T.comment : isWhite ? "rgba(255,255,255,0.55)" : spotifyTransparent ? "rgba(255,255,255,0.5)" : "rgb(var(--c-comment))";
  const accent  = T ? T.accent  : isWhite ? "#FFFFFF"                                                      : "rgb(var(--c-accent))";
  const deep    = T ? T.deep    : spotifyTransparent ? "rgba(0,0,0,0.85)"                                  : "rgb(var(--c-deep))";

  const refresh = useCallback(async () => {
    const running = await spotifyRunning();
    if (!running) { setNotRunning(true); setState(null); return; }
    setNotRunning(false);
    setState(await getSpotifyState());
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 4000); return () => { clearInterval(id); cancelAnimationFrame(rafRef.current); }; }, [refresh]);

  useEffect(() => {
    if (!state?.playing) return;
    const id = setInterval(() =>
      setState(s => s ? { ...s, position: Math.min(s.position + 1, s.duration) } : s), 1000);
    return () => clearInterval(id);
  }, [state?.playing]);

  const cmd = async (script: string) => {
    await as(`tell application "Spotify" to ${script}`);
    setTimeout(refresh, 350);
  };

  const search = async () => {
    if (!query.trim()) return;
    await invoke("spotify_open_url", { url: `spotify:search:${encodeURIComponent(query)}` });
    setQuery(""); setShowSearch(false);
  };

  const startLoop = () => {
    cancelAnimationFrame(rafRef.current);
    const stiffness = 0.022;
    const damping   = 0.92;
    const loop = () => {
      setPos(cur => {
        const dx = targetRef.current.x - cur.x;
        const dy = targetRef.current.y - cur.y;
        velRef.current.x = velRef.current.x * damping + dx * stiffness;
        velRef.current.y = velRef.current.y * damping + dy * stiffness;
        const nx = cur.x + velRef.current.x;
        const ny = cur.y + velRef.current.y;
        const settled = Math.abs(velRef.current.x) < 0.05 && Math.abs(velRef.current.y) < 0.05;
        if (!settled) rafRef.current = requestAnimationFrame(loop);
        return settled ? cur : { x: nx, y: ny };
      });
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    targetRef.current = { x: window.innerWidth - 340, y: window.innerHeight - 320 };
    startLoop();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    e.preventDefault();
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      targetRef.current = { x: ev.clientX - offsetRef.current.x, y: ev.clientY - offsetRef.current.y };
      startLoop();
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = state ? Math.min(100, (state.position / state.duration) * 100) : 0;

  return (
    <div onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
      width: 320, cursor: "grab", userSelect: "none",
      background: bg,
      backdropFilter: spotifyTransparent ? "none" : T ? "none" : "blur(32px) saturate(2)",
      border: `1px solid ${border}`,
      borderRadius: 16, overflow: "hidden",
      boxShadow: spotifyTransparent ? "none" : "0 20px 60px rgba(0,0,0,0.65)",
      fontFamily: "'JetBrains Mono', monospace", color: fg,
    }}>

      {/* ── Visualizer ── */}
      <div style={{ position: "relative", background: surface }}>
        <Visualizer playing={state?.playing ?? false} spMode={spMode} />
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, transparent 50%, ${bg})`,
          pointerEvents: "none",
        }} />
      </div>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 12px 4px", gap: 5 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={accent}>
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: comment }}>SPOTIFY</span>
        <button onClick={cycleMode}
          title={`Theme: ${spMode} → click to cycle`}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
            color: spMode === "editor" ? comment : accent,
            opacity: spMode === "editor" ? 0.5 : 1,
            textDecoration: spMode === "white" ? "underline" : "none",
          }}>SP</button>
        <IBtn fg={fg} comment={comment} onClick={() => setShowSearch(v => !v)} title="Search"><Search size={12} /></IBtn>
        <IBtn fg={fg} comment={comment} onClick={onClose} title="Close"><X size={13} /></IBtn>
      </div>

      {/* ── Not running ── */}
      {notRunning && (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <Music size={28} color={comment} style={{ margin: "0 auto 10px", display: "block" }} />
          <p style={{ margin: 0, fontSize: 11, color: comment, lineHeight: 1.6 }}>
            Spotify isn't running.{" "}
            <span onClick={() => invoke("spotify_open_url", { url: "spotify:" }).then(refresh)}
              style={{ color: accent, cursor: "pointer" }}>Open it</span>
          </p>
        </div>
      )}

      {/* ── Player ── */}
      {!notRunning && (
        <div style={{ padding: "8px 14px 14px" }}>
          {/* Art + info */}
          <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 12 }}>
            {state?.art
              ? <img src={state.art} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} />
              : <div style={{ width: 52, height: 52, borderRadius: 8, background: border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Music size={20} color={comment} />
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {state?.name ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: comment, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {state?.artist ?? ""}
              </div>
              <div style={{ fontSize: 10, color: "rgb(var(--c-border))", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {state?.album ?? ""}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 9.5, color: comment, minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {state ? fmt(state.position) : "0:00"}
            </span>
            <div style={{ flex: 1, height: 3, background: border, borderRadius: 2, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${pct}%`, background: accent, borderRadius: 2, transition: "width 1s linear" }} />
            </div>
            <span style={{ fontSize: 9.5, color: comment, minWidth: 30, fontVariantNumeric: "tabular-nums" }}>
              {state ? fmt(state.duration) : "0:00"}
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 12 }}>
            <IBtn fg={fg} comment={comment} onClick={() => cmd("previous track")} title="Previous"><SkipBack size={16} /></IBtn>
            <button onClick={() => cmd(state?.playing ? "pause" : "play")} style={{
              width: 40, height: 40, borderRadius: "50%", background: accent,
              border: "none", cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", color: deep,
              boxShadow: `0 0 20px ${accent}66`,
            }}>
              {state?.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <IBtn fg={fg} comment={comment} onClick={() => cmd("next track")} title="Next"><SkipForward size={16} /></IBtn>
          </div>

          {/* Volume */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Volume2 size={11} color={comment} style={{ flexShrink: 0 }} />
            <input type="range" min={0} max={100} value={state?.volume ?? 50}
              onChange={e => cmd(`set sound volume to ${e.target.value}`)}
              style={{ flex: 1, accentColor: accent, cursor: "pointer" }}
            />
          </div>
        </div>
      )}

      {/* ── Search ── */}
      {showSearch && (
        <div style={{ borderTop: `1px solid ${border}`, padding: "10px 14px 14px" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input autoFocus value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Search in Spotify…"
              style={{
                flex: 1, background: surface, border: `1px solid ${border}`,
                borderRadius: 7, padding: "6px 10px", color: fg,
                fontSize: 11.5, fontFamily: "inherit", outline: "none",
              }}
            />
            <button onClick={search} style={{
              width: 34, background: accent, border: "none", borderRadius: 7,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: deep,
            }}><Search size={13} /></button>
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 10, color: comment }}>Opens search in Spotify app</p>
        </div>
      )}
    </div>
  );
}

function IBtn({ onClick, title, children, fg, comment }: {
  onClick: () => void; title: string; children: React.ReactNode; fg: string; comment: string;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", cursor: "pointer",
      color: comment, padding: 4, display: "flex", borderRadius: 4,
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = fg}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = comment}
    >{children}</button>
  );
}
