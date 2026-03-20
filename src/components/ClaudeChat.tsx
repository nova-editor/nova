/**
 * ClaudeChat — full agent-mode chat via claude -p --output-format stream-json.
 *
 * Shows thinking blocks, tool calls + results (like VS Code extension),
 * and streams the final text response. No API key needed.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { invoke }              from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { marked }              from "marked";
import {
  Send, Square, FileCode, ChevronDown, RefreshCw,
  Terminal, Pencil, Eye, FilePlus, Wrench, ChevronRight,
} from "lucide-react";
import { useStore, tabContentMap } from "../store";
import { AnthropicLogo }           from "./AiLogos";

marked.setOptions({ breaks: true, gfm: true });

// ── Types ──────────────────────────────────────────────────────────────────────
interface Msg { role: "user" | "assistant"; content: string; }

interface ToolCall {
  id:       string;
  name:     string;
  summary:  string;
  result?:  string;
  isError?: boolean;
  diffOld?: string;
  diffNew?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function renderMd(md: string): string {
  try { return marked.parse(md) as string; }
  catch { return md.replace(/\n/g, "<br/>"); }
}

const TOOL_ICON: Record<string, React.ReactNode> = {
  bash:                        <Terminal size={9} />,
  str_replace_editor:          <Pencil   size={9} />,
  str_replace_based_edit_tool: <Pencil   size={9} />,
  read_file:                   <Eye      size={9} />,
  view:                        <Eye      size={9} />,
  write_file:                  <FilePlus size={9} />,
  create:                      <FilePlus size={9} />,
};

// ── Context pill ───────────────────────────────────────────────────────────────
function ContextPill({ name, lang, line }: { name: string; lang: string; line: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 5,
      background: "rgb(var(--c-border) / 0.3)", border: "1px solid rgb(var(--c-border) / 0.5)",
      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
      color: "rgb(var(--c-comment))", userSelect: "none",
    }}>
      <FileCode size={10} />
      <span>{name}</span>
      <span style={{ opacity: 0.5 }}>{lang} · L{line}</span>
    </div>
  );
}

// ── Thinking block (collapsible) ───────────────────────────────────────────────
function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const words = text.trim().split(/\s+/).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgb(var(--c-accent) / 0.05)",
          border: "1px solid rgb(var(--c-accent) / 0.15)",
          borderRadius: open ? "6px 6px 0 0" : 6,
          padding: "5px 10px", cursor: "pointer", width: "fit-content",
        }}
      >
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: streaming ? "rgb(var(--c-accent) / 0.8)" : "rgb(var(--c-accent) / 0.35)",
          animation: streaming ? "chat-dot 1.2s ease-in-out infinite" : "none",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: streaming ? "rgb(var(--c-accent) / 0.8)" : "rgb(var(--c-comment))",
          letterSpacing: "0.04em",
        }}>
          {streaming ? "thinking…" : `thought for ${words > 200 ? "a while" : "a moment"}`}
        </span>
        <ChevronRight size={9} style={{
          color: "rgb(var(--c-comment))",
          transform: open ? "rotate(90deg)" : "none",
          transition: "transform 0.15s",
        }} />
      </button>
      {open && (
        <div style={{
          border: "1px solid rgb(var(--c-accent) / 0.12)",
          borderTop: "none", borderRadius: "0 0 6px 6px",
          padding: "10px 12px",
          background: "rgb(var(--c-accent) / 0.03)",
          fontSize: 11, fontFamily: "Inter, -apple-system, sans-serif",
          color: "rgb(var(--c-comment))", lineHeight: 1.65,
          whiteSpace: "pre-wrap", fontStyle: "italic",
          maxHeight: 200, overflowY: "auto",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ── Inline diff view ───────────────────────────────────────────────────────────
function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const oldLines = (oldText ?? "").split("\n");
  const newLines = (newText ?? "").split("\n");
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      lineHeight: 1.6, overflowX: "auto", maxHeight: 260, overflowY: "auto",
    }}>
      {oldLines.map((line, i) => (
        <div key={`r${i}`} style={{
          background: "rgb(var(--c-red) / 0.08)",
          color: "rgb(var(--c-red) / 0.8)",
          padding: "0 10px", whiteSpace: "pre",
        }}>
          <span style={{ opacity: 0.45, userSelect: "none", marginRight: 8 }}>−</span>{line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`a${i}`} style={{
          background: "rgb(var(--c-green) / 0.08)",
          color: "rgb(var(--c-green) / 0.8)",
          padding: "0 10px", whiteSpace: "pre",
        }}>
          <span style={{ opacity: 0.45, userSelect: "none", marginRight: 8 }}>+</span>{line}
        </div>
      ))}
    </div>
  );
}

// ── Tool call row ──────────────────────────────────────────────────────────────
function ToolRow({ tool, active }: { tool: ToolCall; active: boolean }) {
  const [open, setOpen] = useState(false);
  const icon = TOOL_ICON[tool.name] ?? <Wrench size={9} />;
  // null-safe: Rust sends JSON null (not undefined) for absent diff fields
  const hasDiff    = tool.diffOld != null && tool.diffNew != null;
  const hasResult  = tool.result  != null;
  const expandable = hasDiff || hasResult;

  return (
    <div style={{
      borderRadius: 5,
      border: `1px solid ${active ? "rgb(var(--c-accent) / 0.25)" : "rgb(var(--c-border) / 0.5)"}`,
      background: active ? "rgb(var(--c-accent) / 0.04)" : "rgb(var(--c-border) / 0.15)",
      overflow: "hidden", transition: "border-color 0.25s, background 0.25s",
    }}>
      <button
        onClick={() => expandable && setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px", background: "none", border: "none",
          cursor: expandable ? "pointer" : "default", textAlign: "left",
        }}
      >
        <span style={{ color: active ? "rgb(var(--c-accent) / 0.9)" : "rgb(var(--c-comment))", flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: active ? "rgb(var(--c-accent))" : "rgb(var(--c-fg))", fontWeight: 500, opacity: active ? 1 : 0.6,
        }}>
          {tool.name}
        </span>
        {tool.summary && (
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: "rgb(var(--c-comment))",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            opacity: active ? 0.8 : 0.5,
          }}>
            {tool.summary}
          </span>
        )}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
          {active && (
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "rgb(var(--c-accent) / 0.8)",
              animation: "chat-dot 1.2s ease-in-out infinite",
            }} />
          )}
          {!active && hasDiff && (
            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-green) / 0.6)" }}>
              diff
            </span>
          )}
          {!active && tool.isError && (
            <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-red) / 0.7)" }}>
              error
            </span>
          )}
          {expandable && (
            <ChevronRight size={9} style={{
              color: "rgb(var(--c-comment))",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }} />
          )}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid rgb(var(--c-border) / 0.4)" }}>
          {hasDiff && (
            <InlineDiff oldText={tool.diffOld!} newText={tool.diffNew!} />
          )}
          {hasResult && !hasDiff && (
            <div style={{
              padding: "6px 10px 8px",
              fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
              color: tool.isError ? "rgb(var(--c-red) / 0.8)" : "rgb(var(--c-comment))",
              whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto", lineHeight: 1.55,
            }}>
              {tool.result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assistant message bubble ───────────────────────────────────────────────────
function AssistantBubble({
  msg, streaming, thinking, tools,
}: {
  msg: Msg; streaming: boolean;
  thinking: string | null;
  tools: ToolCall[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 2 }}>
        <AnthropicLogo size={11} style={{ color: "#D97757", opacity: 0.8 }} />
        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Claude</span>
      </div>

      {/* Thinking block */}
      {thinking && <ThinkingBlock text={thinking} streaming={streaming && msg.content === ""} />}

      {/* Tool calls */}
      {tools.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", maxWidth: "92%" }}>
          {tools.map((t, i) => (
            <ToolRow
              key={t.id || i}
              tool={t}
              active={streaming && i === tools.length - 1 && !t.result}
            />
          ))}
        </div>
      )}

      {/* Text response */}
      {(msg.content || (!streaming && tools.length === 0)) && (
        <div
          className="prose-claude"
          style={{
            maxWidth: "90%", fontSize: 12.5,
            fontFamily: "Inter, -apple-system, sans-serif",
            color: "rgb(var(--c-fg))", lineHeight: 1.65, wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: renderMd(msg.content) || "…" }}
        />
      )}

      {/* Thinking dots — before any content arrives */}
      {streaming && msg.content === "" && tools.length === 0 && !thinking && (
        <div style={{ display: "flex", gap: 3, paddingLeft: 2, paddingTop: 2 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: "50%", background: "#D97757", opacity: 0.7,
              animation: `chat-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserBubble({ msg }: { msg: Msg }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{
        maxWidth: "85%", padding: "7px 11px",
        borderRadius: "10px 10px 3px 10px",
        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)",
        fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
        color: "rgb(var(--c-fg))", lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </div>
  );
}

// ── Turn — groups one user+assistant exchange ──────────────────────────────────
interface Turn {
  user:     Msg;
  assistant: Msg;
  thinking:  string | null;
  tools:     ToolCall[];
}

// ── Main ───────────────────────────────────────────────────────────────────────
interface ClaudeChatProps { visible: boolean }

export function ClaudeChat({ visible }: ClaudeChatProps) {
  const [turns,      setTurns]      = useState<Turn[]>([]);
  const [input,      setInput]      = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [claudePath, setClaudePath] = useState<string | null>(null);
  const [findError,  setFindError]  = useState<string | null>(null);
  const [showCtx,    setShowCtx]    = useState(true);

  const resumeSession = useRef<string | null>(null);
  const sessionId     = useRef(`cc-${crypto.randomUUID()}`);
  const unlistens     = useRef<UnlistenFn[]>([]);
  const aborted       = useRef(false);
  const bottomRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const isFirstMsg    = useRef(true);

  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const leftPane      = useStore((s) => s.leftPane);
  const cursorLine    = useStore((s) => s.cursorLine);

  const activeTab   = leftPane.tabs.find((t) => t.kind === "file");
  const fileContent = activeTab ? (tabContentMap.get(activeTab.path) ?? "") : "";
  const fileName    = activeTab?.name ?? "";
  const fileLang    = activeTab?.language ?? "";

  const CTX_CHAR_LIMIT = 8_000;

  useEffect(() => {
    invoke<string>("find_claude_path")
      .then((p) => setClaudePath(p))
      .catch((e: unknown) => setFindError(String(e)));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, streaming]);
  useEffect(() => { if (visible) textareaRef.current?.focus(); }, [visible]);
  useEffect(() => () => { unlistens.current.forEach((fn) => fn()); }, []);

  const buildPrompt = useCallback((userText: string): string => {
    if (!isFirstMsg.current) return userText;
    let ctx = "";
    if (workspaceRoot) ctx += `Workspace: ${workspaceRoot}\n`;
    if (activeTab) {
      ctx += `File: ${activeTab.path} (${fileLang}, cursor line ${cursorLine})\n`;
      if (fileContent) {
        const raw = fileContent.slice(0, CTX_CHAR_LIMIT);
        const truncated = fileContent.length > CTX_CHAR_LIMIT;
        ctx += `\n\`\`\`${fileLang}\n${raw}${truncated ? "\n// … (truncated)" : ""}\n\`\`\`\n\n`;
      }
    }
    return ctx ? `${ctx}\n${userText}` : userText;
  }, [workspaceRoot, activeTab, fileContent, fileLang, cursorLine]);

  const stop = useCallback(() => {
    aborted.current = true;
    unlistens.current.forEach((fn) => fn());
    unlistens.current = [];
    setStreaming(false);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !claudePath || streaming) return;

    const newTurn: Turn = {
      user:      { role: "user",      content: text },
      assistant: { role: "assistant", content: "" },
      thinking:  null,
      tools:     [],
    };
    setTurns((prev) => [...prev, newTurn]);
    setInput("");
    setStreaming(true);
    aborted.current = false;

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    unlistens.current.forEach((fn) => fn());
    unlistens.current = [];

    const sid = sessionId.current;

    const updateLast = (fn: (t: Turn) => Turn) =>
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    const listeners = await Promise.all([
      // Text delta
      listen<string>(`claude-chat-delta-${sid}`, (ev) => {
        if (aborted.current) return;
        updateLast((t) => ({ ...t, assistant: { ...t.assistant, content: t.assistant.content + ev.payload } }));
      }),
      // Thinking block (full text, replaced each time)
      listen<string>(`claude-chat-thinking-${sid}`, (ev) => {
        if (aborted.current) return;
        updateLast((t) => ({ ...t, thinking: ev.payload }));
      }),
      // New tool call
      listen<string>(`claude-chat-tool-${sid}`, (ev) => {
        if (aborted.current) return;
        try {
          const tc = JSON.parse(ev.payload) as ToolCall;
          updateLast((t) => ({ ...t, tools: [...t.tools, tc] }));
        } catch { /* ignore */ }
      }),
      // Tool result — match by id and trigger tree refresh for file ops
      listen<string>(`claude-chat-tool-result-${sid}`, (ev) => {
        if (aborted.current) return;
        try {
          const { id, content, isError } = JSON.parse(ev.payload) as { id: string; content: string; isError: boolean };
          updateLast((t) => {
            const tc = t.tools.find((x) => x.id === id);
            // Refresh file tree when a file-modifying tool completes
            if (tc && ["str_replace_editor", "str_replace_based_edit_tool", "write_file", "create", "bash"].includes(tc.name)) {
              const root = useStore.getState().workspaceRoot;
              if (root) window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: root }));
            }
            return { ...t, tools: t.tools.map((x) => x.id === id ? { ...x, result: content, isError } : x) };
          });
        } catch { /* ignore */ }
      }),
      // Usage tracking
      listen<string>(`claude-chat-usage-${sid}`, (ev) => {
        try {
          const u = JSON.parse(ev.payload) as { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number };
          useStore.getState().addClaudeUsage({
            input:  u.inputTokens,
            output: u.outputTokens,
            cache:  u.cacheCreationTokens + u.cacheReadTokens,
          });
        } catch { /* ignore */ }
      }),
      // Session id for --resume
      listen<string>(`claude-chat-session-${sid}`, (ev) => {
        resumeSession.current = ev.payload;
      }),
      // Done — also do a final tree refresh in case any tools ran
      listen<string>(`claude-chat-done-${sid}`, () => {
        if (!aborted.current) {
          setStreaming(false);
          isFirstMsg.current = false;
          const root = useStore.getState().workspaceRoot;
          if (root) {
            window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: root }));
          }
        }
      }),
      // Error
      listen<string>(`claude-chat-error-${sid}`, (ev) => {
        if (aborted.current) return;
        updateLast((t) => ({ ...t, assistant: { ...t.assistant, content: `**Error:** ${ev.payload}` } }));
        setStreaming(false);
      }),
    ]);

    unlistens.current = listeners;

    invoke("claude_cli_chat", {
      sessionId:     sid,
      claudePath,
      prompt:        buildPrompt(text),
      resumeSession: resumeSession.current ?? null,
    }).catch((err) => {
      if (!aborted.current) {
        updateLast((t) => ({ ...t, assistant: { ...t.assistant, content: `**Error:** ${String(err)}` } }));
        setStreaming(false);
      }
    });
  }, [input, claudePath, streaming, buildPrompt]);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    resumeSession.current = null;
    isFirstMsg.current    = true;
    sessionId.current     = `cc-${crypto.randomUUID()}`;
  }, [stop]);

  if (!visible) return null;

  if (findError) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "rgb(var(--c-blue) / 0.04)", backdropFilter: "blur(20px) saturate(1.4)", WebkitBackdropFilter: "blur(20px) saturate(1.4)" }}>
        <AnthropicLogo size={32} style={{ opacity: 0.2, color: "rgb(var(--c-fg))" }} />
        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-fg))" }}>Claude CLI not found</span>
        <pre style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-comment))", textAlign: "center", whiteSpace: "pre-wrap" }}>{findError}</pre>
      </div>
    );
  }

  const lastTurn = turns[turns.length - 1];

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden",
      background: "rgb(var(--c-blue) / 0.04)",
      backdropFilter: "blur(20px) saturate(1.4)",
      WebkitBackdropFilter: "blur(20px) saturate(1.4)",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgb(var(--c-border) / 0.5)", flexShrink: 0 }}>
        <AnthropicLogo size={13} style={{ color: "#D97757" }} />
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "rgb(var(--c-fg))" }}>Claude</span>
        <span style={{ fontSize: 9, color: "rgb(var(--c-comment))", fontFamily: "'JetBrains Mono', monospace", opacity: 0.5 }}>claude code · chat</span>
        <div style={{ flex: 1 }} />
        {fileName && (
          <button onClick={() => setShowCtx((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <ContextPill name={fileName} lang={fileLang} line={cursorLine} />
            <ChevronDown size={10} style={{ color: "rgb(var(--c-comment))", transform: showCtx ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        )}
        {turns.length > 0 && (
          <button onClick={reset} title="New conversation" style={{ background: "none", border: "none", cursor: "pointer", color: "rgb(var(--c-comment))", padding: 2, opacity: 0.6 }}>
            <RefreshCw size={11} />
          </button>
        )}
      </div>

      {/* ── Context strip ── */}
      {showCtx && activeTab && (
        <div style={{ padding: "5px 12px", borderBottom: "1px solid rgb(var(--c-border) / 0.3)", flexShrink: 0, display: "flex", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-comment))", opacity: 0.7 }}>
          <span style={{ opacity: 0.6 }}>ctx</span>
          <span>{activeTab.path.replace(workspaceRoot + "/", "")}</span>
          {fileContent && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: fileContent.length > CTX_CHAR_LIMIT ? "rgb(var(--c-red) / 0.7)" : undefined }}>
                {Math.min(fileContent.length, CTX_CHAR_LIMIT).toLocaleString()}{fileContent.length > CTX_CHAR_LIMIT ? "/8k" : "ch"}
              </span>
            </>
          )}
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: resumeSession.current ? "rgb(var(--c-green) / 0.7)" : undefined }}>
            {resumeSession.current ? "session active" : "first message injects context"}
          </span>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 24 }}>
        {turns.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.3, userSelect: "none", textAlign: "center" }}>
            <AnthropicLogo size={28} style={{ color: "rgb(var(--c-fg))" }} />
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "rgb(var(--c-fg))" }}>
              {activeTab ? `Ask about ${fileName}` : "Ask Claude anything"}
            </span>
            <span style={{ fontSize: 10, color: "rgb(var(--c-comment))", fontFamily: "'JetBrains Mono', monospace" }}>⌘↵ to send</span>
          </div>
        )}
        {turns.map((turn, i) => {
          const isLast   = i === turns.length - 1;
          const isActive = isLast && streaming;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <UserBubble msg={turn.user} />
              <AssistantBubble
                msg={turn.assistant}
                streaming={isActive}
                thinking={turn.thinking}
                tools={turn.tools}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Status bar (agent loop progress) ── */}
      {streaming && lastTurn && (
        <div style={{
          padding: "4px 14px", borderTop: "1px solid rgb(var(--c-border) / 0.3)",
          flexShrink: 0, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: "rgb(var(--c-accent) / 0.6)", display: "flex", alignItems: "center", gap: 6,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgb(var(--c-accent) / 0.7)", animation: "chat-dot 1.2s ease-in-out infinite" }} />
          {lastTurn.tools.length > 0
            ? `${lastTurn.tools.length} tool${lastTurn.tools.length > 1 ? "s" : ""} used · working…`
            : lastTurn.thinking ? "thinking…" : "waiting for response…"
          }
        </div>
      )}

      {/* ── Input ── */}
      <div style={{ padding: "8px 10px 10px", borderTop: streaming ? "none" : "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", gap: 7, alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder={claudePath ? "Ask Claude… (⌘↵ to send)" : "Locating claude…"}
          disabled={!claudePath}
          rows={1}
          style={{
            flex: 1, resize: "none",
            background: "rgb(var(--c-border) / 0.25)", border: "1px solid rgb(var(--c-border) / 0.5)",
            borderRadius: 8, padding: "7px 10px",
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            color: "rgb(var(--c-fg))", outline: "none", lineHeight: 1.5,
            maxHeight: 160, overflowY: "auto",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 160) + "px";
          }}
        />
        {streaming ? (
          <button onClick={stop} title="Stop" style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,80,80,0.3)", cursor: "pointer", color: "#ff6060" }}>
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim() || !claudePath} title="Send (⌘↵)" style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: input.trim() ? "rgba(217,119,87,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${input.trim() ? "rgba(217,119,87,0.4)" : "rgba(255,255,255,0.07)"}`, cursor: input.trim() ? "pointer" : "default", color: input.trim() ? "#D97757" : "rgba(255,255,255,0.2)", transition: "all 0.12s" }}>
            <Send size={11} />
          </button>
        )}
      </div>

      <style>{`
        @keyframes chat-dot {
          0%,80%,100% { transform:scale(0.6); opacity:0.4; }
          40%          { transform:scale(1);   opacity:1;   }
        }
        .prose-claude p { margin: 0 0 8px; }
        .prose-claude p:last-child { margin-bottom: 0; }
        .prose-claude pre {
          background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 6px 0;
          font-family: 'JetBrains Mono',monospace; font-size: 11.5px; line-height: 1.55;
        }
        .prose-claude code { font-family: 'JetBrains Mono',monospace; font-size: 11.5px; background: rgba(255,255,255,0.07); padding: 1px 4px; border-radius: 3px; }
        .prose-claude pre code { background: none; padding: 0; }
        .prose-claude h1,.prose-claude h2,.prose-claude h3 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; }
        .prose-claude ul,.prose-claude ol { padding-left: 18px; margin: 4px 0 8px; }
        .prose-claude li { margin: 2px 0; }
        .prose-claude blockquote { border-left: 2px solid rgba(255,255,255,0.2); padding-left: 10px; color: rgba(255,255,255,0.5); margin: 4px 0; }
        .prose-claude a { color: #D97757; text-decoration: none; }
        .prose-claude strong { color: rgb(var(--c-fg)); font-weight: 600; }
      `}</style>
    </div>
  );
}
