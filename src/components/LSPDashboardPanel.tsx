import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  AlertTriangle, Activity, Bug, CheckCircle2, ChevronDown, ChevronRight,
  Pause, Play, RotateCcw, Search, Server, Skull, Trash2, X, Zap,
} from "lucide-react";
import { useStore } from "../store";

type LspStatus = "starting" | "running" | "stopped" | "crashed" | "unresponsive";
type LspHealth = "healthy" | "slow" | "unresponsive" | "crashed" | "stopped";
type LogLevel = "info" | "warn" | "error";

interface DiagnosticsHealth {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  updateCount: number;
  lastUpdateAt?: number;
  lastSuccessAt?: number;
  responseLatencyMs?: number;
}

interface LspServerSnapshot {
  id: string;
  language: string;
  serverType: string;
  workspaceRoot: string;
  pid?: number;
  command: string[];
  status: LspStatus;
  health: LspHealth;
  startedAt?: number;
  lastEventAt?: number;
  restartCount: number;
  autoRestarts: number;
  diagnostics: DiagnosticsHealth;
}

interface LspLogEntry {
  id: string;
  serverId: string;
  timestamp: number;
  level: LogLevel;
  message: string;
}

function formatTime(ms?: number) {
  if (!ms) return "never";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusColor(health: LspHealth) {
  switch (health) {
    case "healthy": return "text-editor-green";
    case "slow": return "text-editor-yellow";
    case "unresponsive": return "text-editor-yellow";
    case "crashed": return "text-editor-red";
    default: return "text-editor-comment";
  }
}

function statusIcon(health: LspHealth) {
  switch (health) {
    case "healthy": return <CheckCircle2 size={13} />;
    case "slow": return <Zap size={13} />;
    case "unresponsive": return <AlertTriangle size={13} />;
    case "crashed": return <Skull size={13} />;
    default: return <Activity size={13} />;
  }
}

export function LSPDashboardPanel() {
  const onClose = useStore((s) => s.toggleLspDashboard);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const [servers, setServers] = useState<LspServerSnapshot[]>([]);
  const [logs, setLogs] = useState<LspLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Monitoring LSP servers");
  const logEndRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const refresh = async () => {
    const [serverList, logList] = await Promise.all([
      invoke<LspServerSnapshot[]>("lsp_servers"),
      invoke<LspLogEntry[]>("lsp_logs", { limit: 700 }),
    ]);
    setServers(serverList);
    setLogs(logList);
  };

  useEffect(() => {
    refresh().catch(() => setStatus("LSP monitor is unavailable"));
    const unsubs: UnlistenFn[] = [];
    listen<LspServerSnapshot[]>("lsp://servers", (event) => setServers(event.payload)).then((fn) => unsubs.push(fn));
    listen<LspLogEntry>("lsp://log", (event) => {
      if (pausedRef.current) return;
      setLogs((prev) => [...prev.slice(-799), event.payload]);
    }).then((fn) => unsubs.push(fn));
    listen("lsp://logs-cleared", () => setLogs([])).then((fn) => unsubs.push(fn));
    const poll = window.setInterval(() => refresh().catch(() => {}), 8000);
    return () => {
      window.clearInterval(poll);
      unsubs.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!paused) logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length, paused]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (serverFilter !== "all" && entry.serverId !== serverFilter) return false;
      if (!q) return true;
      return entry.message.toLowerCase().includes(q) || entry.level.includes(q) || entry.serverId.toLowerCase().includes(q);
    });
  }, [logs, query, serverFilter]);

  const totals = servers.reduce(
    (acc, server) => {
      acc.errors += server.diagnostics.errorCount;
      acc.warnings += server.diagnostics.warningCount;
      if (server.health === "healthy") acc.healthy += 1;
      if (server.health === "slow" || server.health === "unresponsive") acc.slow += 1;
      if (server.health === "crashed") acc.crashed += 1;
      return acc;
    },
    { errors: 0, warnings: 0, healthy: 0, slow: 0, crashed: 0 },
  );

  const restart = async (serverId: string) => {
    setStatus("Restarting server...");
    try {
      await invoke("lsp_restart_server", { serverId });
      setStatus("Restarted LSP server");
      await refresh();
    } catch (e) {
      setStatus(`Restart failed: ${e}`);
    }
  };

  const kill = async (serverId: string) => {
    setStatus("Killing server...");
    try {
      await invoke("lsp_kill_server", { serverId });
      setStatus("Killed LSP server");
      await refresh();
    } catch (e) {
      setStatus(`Kill failed: ${e}`);
    }
  };

  const restartAll = async () => {
    setStatus("Restarting all servers...");
    try {
      await invoke("lsp_restart_all");
      setStatus("Restarted all LSP servers");
      await refresh();
    } catch (e) {
      setStatus(`Restart all failed: ${e}`);
    }
  };

  const clearLogs = async () => {
    await invoke("lsp_clear_logs", { serverId: serverFilter === "all" ? null : serverFilter }).catch(() => {});
    if (serverFilter === "all") setLogs([]);
    else setLogs((prev) => prev.filter((entry) => entry.serverId !== serverFilter));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-5xl border-l border-editor-border shadow-2xl fade-in"
      style={{ background: "rgb(var(--c-bg) / 0.96)", backdropFilter: "blur(22px) saturate(1.3)" }}>
      <div className="flex flex-col w-full min-w-0">
        <div className="flex items-center gap-3 shrink-0 px-4 border-b border-editor-border" style={{ height: 44 }}>
          <Server size={15} className="text-editor-accent" />
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-semibold text-editor-fg">LSP Monitor</div>
            <div className="text-2xs text-editor-comment truncate">{workspaceRoot || "No workspace"} · {status}</div>
          </div>
          <div className="flex-1" />
          <button onClick={restartAll} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-editor-comment hover:text-editor-fg hover:bg-white/5">
            <RotateCcw size={12} /> Restart all
          </button>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded text-editor-comment hover:text-editor-fg hover:bg-white/5">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 shrink-0 p-3 border-b border-editor-border">
          {[
            ["Servers", servers.length, "text-editor-fg"],
            ["Healthy", totals.healthy, "text-editor-green"],
            ["Slow", totals.slow, "text-editor-yellow"],
            ["Errors", totals.errors, "text-editor-red"],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded border border-editor-border px-3 py-2" style={{ background: "rgb(var(--c-sidebar) / 0.5)" }}>
              <div className="text-2xs uppercase text-editor-comment">{label}</div>
              <div className={`text-lg font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[42%] min-w-[320px] overflow-y-auto border-r border-editor-border p-3">
            <div className="flex flex-col gap-2">
              {servers.length === 0 && (
                <div className="rounded border border-editor-border p-4 text-sm text-editor-comment">
                  Open a supported file to register its language server.
                </div>
              )}
              {servers.map((server) => {
                const isOpen = expanded[server.id] ?? true;
                return (
                  <div key={server.id} className="rounded border border-editor-border overflow-hidden" style={{ background: "rgb(var(--c-sidebar) / 0.42)" }}>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [server.id]: !isOpen }))}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className={statusColor(server.health)}>{statusIcon(server.health)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-editor-fg truncate">{server.serverType || server.language}</div>
                        <div className="text-2xs text-editor-comment truncate">{server.language} · {server.status} · pid {server.pid ?? "n/a"}</div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-2xs">
                          <div><span className="text-editor-comment">Errors</span><div className="text-editor-red">{server.diagnostics.errorCount}</div></div>
                          <div><span className="text-editor-comment">Warnings</span><div className="text-editor-yellow">{server.diagnostics.warningCount}</div></div>
                          <div><span className="text-editor-comment">Latency</span><div>{server.diagnostics.responseLatencyMs ?? "n/a"} ms</div></div>
                          <div><span className="text-editor-comment">Updates</span><div>{server.diagnostics.updateCount}</div></div>
                          <div><span className="text-editor-comment">Last OK</span><div>{formatTime(server.diagnostics.lastSuccessAt)}</div></div>
                          <div><span className="text-editor-comment">Restarts</span><div>{server.restartCount}</div></div>
                        </div>
                        <div className="text-2xs text-editor-comment truncate" title={server.command.join(" ")}>
                          {server.command.length ? server.command.join(" ") : "No configured server command"}
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => restart(server.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/5 text-editor-comment hover:text-editor-fg">
                            <RotateCcw size={11} /> Restart
                          </button>
                          <button onClick={() => kill(server.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-red-500/10 text-editor-red">
                            <Skull size={11} /> Kill
                          </button>
                          <button onClick={() => setServerFilter(server.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/5 text-editor-comment hover:text-editor-fg">
                            <Bug size={11} /> Logs
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0 p-3 border-b border-editor-border">
              <div className="flex items-center gap-2 flex-1 min-w-0 rounded border border-editor-border px-2 py-1.5">
                <Search size={12} className="text-editor-comment" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter logs..."
                  className="flex-1 min-w-0 bg-transparent outline-none text-xs text-editor-fg placeholder-editor-comment"
                />
              </div>
              <select value={serverFilter} onChange={(e) => setServerFilter(e.target.value)}
                className="bg-transparent border border-editor-border rounded px-2 py-1.5 text-xs text-editor-fg outline-none">
                <option value="all">All servers</option>
                {servers.map((server) => <option key={server.id} value={server.id}>{server.language}</option>)}
              </select>
              <button onClick={() => setPaused((v) => !v)} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-editor-comment hover:text-editor-fg hover:bg-white/5">
                {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? "Resume" : "Pause"}
              </button>
              <button onClick={clearLogs} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-editor-comment hover:text-editor-red hover:bg-red-500/10">
                <Trash2 size={12} /> Clear
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto font-mono text-xs p-3">
              {filteredLogs.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[74px_54px_1fr] gap-2 py-1 border-b border-editor-border/30">
                  <span className="text-editor-comment">{formatTime(entry.timestamp)}</span>
                  <span className={entry.level === "error" ? "text-editor-red" : entry.level === "warn" ? "text-editor-yellow" : "text-editor-blue"}>
                    {entry.level}
                  </span>
                  <span className="text-editor-fg whitespace-pre-wrap break-words">{entry.message}</span>
                </div>
              ))}
              {filteredLogs.length === 0 && <div className="text-editor-comment">No logs match the current filter.</div>}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
