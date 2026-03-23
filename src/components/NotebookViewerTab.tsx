import {
  useMemo, useState, useEffect, useRef, useCallback,
} from "react";
import { marked, Renderer } from "marked";
import {
  FileText, Sun, Moon, ChevronDown, ChevronRight,
  Play, Square, Loader, AlertCircle, RotateCcw, PlayCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { FileTab, tabContentMap } from "../store";
import hljs from "highlight.js/lib/core";
import python     from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import sql        from "highlight.js/lib/languages/sql";
import json       from "highlight.js/lib/languages/json";
import xml        from "highlight.js/lib/languages/xml";
import bash       from "highlight.js/lib/languages/bash";
import r          from "highlight.js/lib/languages/r";
import julia      from "highlight.js/lib/languages/julia";
import katex from "katex";
import "katex/dist/katex.min.css";

// ── highlight.js setup ────────────────────────────────────────────────────────
hljs.registerLanguage("python",     python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("sql",        sql);
hljs.registerLanguage("json",       json);
hljs.registerLanguage("html",       xml);
hljs.registerLanguage("xml",        xml);
hljs.registerLanguage("bash",       bash);
hljs.registerLanguage("r",          r);
hljs.registerLanguage("julia",      julia);

// ── Math ──────────────────────────────────────────────────────────────────────
function renderMath(tex: string, display: boolean): string {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false }); }
  catch { return tex; }
}
function preprocessMath(s: string): string {
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) =>
    `<div class="nb-dm">${renderMath(t.trim(), true)}</div>`);
  s = s.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$/g, (_, t) =>
    `<span>${renderMath(t, false)}</span>`);
  return s;
}

// ── ANSI ──────────────────────────────────────────────────────────────────────
const AC: Record<number, string> = {
  30:"#2e2e2e",31:"#e74c3c",32:"#27ae60",33:"#f39c12",
  34:"#3498db",35:"#9b59b6",36:"#16a085",37:"#ecf0f1",
  90:"#666",   91:"#ff6b6b",92:"#55efc4",93:"#fdcb6e",
  94:"#74b9ff",95:"#fd79a8",96:"#00cec9",97:"#dfe6e9",
};
function ansiHtml(str: string): string {
  const RE = /\x1B\[([0-9;]*)m/g;
  const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let out = "", last = 0, open = 0;
  for (const m of str.matchAll(RE)) {
    out += esc(str.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    for (const c of m[1].split(";").map(Number)) {
      if      (c === 0)              { out += "</span>".repeat(open); open = 0; }
      else if (c === 1)              { out += `<span style="font-weight:700">`; open++; }
      else if (c === 2)              { out += `<span style="opacity:.6">`; open++; }
      else if (c === 3)              { out += `<span style="font-style:italic">`; open++; }
      else if (AC[c] !== undefined)  { out += `<span style="color:${AC[c]}">`; open++; }
    }
  }
  out += esc(str.slice(last));
  out += "</span>".repeat(open);
  return out;
}

// ── Notebook types ────────────────────────────────────────────────────────────
interface OutputData {
  "text/plain"?:    string | string[];
  "text/html"?:     string | string[];
  "text/latex"?:    string | string[];
  "image/png"?:     string;
  "image/jpeg"?:    string;
  "image/svg+xml"?: string | string[];
  "application/json"?: unknown;
}
interface StreamOutput  { output_type:"stream"; name:"stdout"|"stderr"; text:string|string[]; }
interface DisplayOutput { output_type:"display_data";   data:OutputData; metadata:Record<string,unknown>; }
interface ExecuteOutput { output_type:"execute_result"; execution_count:number|null; data:OutputData; metadata:Record<string,unknown>; }
interface ErrorOutput   { output_type:"error"; ename:string; evalue:string; traceback:string[]; }
type Output = StreamOutput | DisplayOutput | ExecuteOutput | ErrorOutput;

interface MarkdownCell { cell_type:"markdown"; source:string|string[]; metadata:Record<string,unknown>; }
interface CodeCell     { cell_type:"code"; source:string|string[]; execution_count:number|null; outputs:Output[]; metadata:Record<string,unknown>; }
interface RawCell      { cell_type:"raw"; source:string|string[]; metadata:Record<string,unknown>; }
type Cell = MarkdownCell | CodeCell | RawCell;

interface Notebook {
  nbformat: number; nbformat_minor: number;
  metadata: {
    kernelspec?:    { display_name:string; language:string; name:string };
    language_info?: { name:string; version?:string };
  };
  cells: Cell[];
}

// ── Kernel / execution types ──────────────────────────────────────────────────
interface JupyterInfo { port:number; token:string; pid:number; mode:string; filename:string; }

type KernelStatus = "idle" | "starting" | "ready" | "busy" | "restarting" | "error";
interface KernelCtx {
  status:    KernelStatus;
  port?:     number;
  token?:    string;
  pid?:      number;
  kernelId?: string;
  sessionId?: string;
  error?:    string;
}

interface CellRun {
  status:         "idle" | "queued" | "running" | "done" | "error";
  outputs:        Output[];
  executionCount?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function srcStr(s: string | string[]): string { return Array.isArray(s) ? s.join("") : s; }

function hl(code: string, lang: string): string {
  try {
    const alias = lang === "py" ? "python" : lang;
    if (hljs.getLanguage(alias)) return hljs.highlight(code, { language: alias }).value;
    return hljs.highlightAuto(code).value;
  } catch {
    return code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
}

// ── CSS (once) ────────────────────────────────────────────────────────────────
let _cssInjected = false;
function injectCss() {
  if (_cssInjected) return;
  _cssInjected = true;
  const el = document.createElement("style");
  el.textContent = `
.hljs{background:#f6f8fa;color:#1f2328}
.hljs-keyword{color:#cf222e;font-weight:600}.hljs-string,.hljs-attr{color:#0a3069}
.hljs-number,.hljs-literal{color:#116329}.hljs-comment{color:#6e7781;font-style:italic}
.hljs-built_in,.hljs-variable{color:#953800}.hljs-type,.hljs-class,.hljs-function,.hljs-title.function_{color:#8250df}
.hljs-params,.hljs-punctuation,.hljs-operator{color:#6e7781}.hljs-decorator,.hljs-meta{color:#0550ae}
.dark .hljs{background:#161b22;color:#e6edf3}
.dark .hljs-keyword{color:#ff7b72;font-weight:600}.dark .hljs-string,.dark .hljs-attr{color:#a5d6ff}
.dark .hljs-number,.dark .hljs-literal{color:#79c0ff}.dark .hljs-comment{color:#8b949e;font-style:italic}
.dark .hljs-built_in,.dark .hljs-variable{color:#ffa657}.dark .hljs-type,.dark .hljs-class,.dark .hljs-function,.dark .hljs-title.function_{color:#d2a8ff}
.dark .hljs-params,.dark .hljs-punctuation,.dark .hljs-operator{color:#8b949e}.dark .hljs-decorator,.dark .hljs-meta{color:#79c0ff}
.nb-html table{border-collapse:collapse;font-size:13px}
.nb-html th,.nb-html td{border:1px solid #d0d7de;padding:4px 10px;text-align:left}
.nb-html th{background:#f6f8fa;font-weight:600;color:#1f2328}
.nb-html tr:nth-child(even){background:#f6f8fa}
.nb-html.dark th,.nb-html.dark td{border-color:#30363d}
.nb-html.dark th{background:#161b22;color:#e6edf3}
.nb-html.dark tr:nth-child(even){background:#161b22}
.nb-html.dark td{color:#e6edf3}
@keyframes nb-spin{to{transform:rotate(360deg)}}
.nb-spin{animation:nb-spin .8s linear infinite;display:inline-block}`;
  document.head.appendChild(el);
}

// ── Output renderer ───────────────────────────────────────────────────────────
function OutputView({ output, dark }: { output:Output; dark:boolean }) {
  const pre: React.CSSProperties = {
    margin:0, padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace",
    fontSize:12, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word",
    overflowX:"auto", background:"transparent",
  };
  if (output.output_type === "stream") {
    const err = output.name === "stderr";
    return <pre style={{ ...pre,
      color: err?(dark?"#f87171":"#b91c1c"):(dark?"#d1d5db":"#374151"),
      borderLeft: err?"3px solid #f87171":"none", paddingLeft: err?9:12,
      background: err?(dark?"rgba(239,68,68,.07)":"rgba(254,202,202,.3)"):"transparent",
    }} dangerouslySetInnerHTML={{ __html: ansiHtml(srcStr(output.text)) }} />;
  }
  if (output.output_type === "error") {
    const tb = output.traceback.map(ansiHtml).join("\n");
    return (
      <div style={{ borderLeft:"3px solid #ef4444", paddingLeft:9, background:dark?"rgba(239,68,68,.08)":"rgba(254,226,226,.5)" }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600, color:dark?"#f87171":"#dc2626", padding:"6px 0 2px" }}>
          {output.ename}: {output.evalue}
        </div>
        <pre style={{ ...pre, color:dark?"#fca5a5":"#b91c1c" }} dangerouslySetInnerHTML={{ __html: tb }} />
      </div>
    );
  }
  const d = output.data;
  if (d["image/png"])  return <div style={{padding:"4px 0"}}><img src={`data:image/png;base64,${d["image/png"]}`}  alt="out" style={{maxWidth:"100%"}} /></div>;
  if (d["image/jpeg"]) return <div style={{padding:"4px 0"}}><img src={`data:image/jpeg;base64,${d["image/jpeg"]}`} alt="out" style={{maxWidth:"100%"}} /></div>;
  if (d["image/svg+xml"]) return <div dangerouslySetInnerHTML={{ __html: srcStr(d["image/svg+xml"] as string|string[]) }} style={{maxWidth:"100%",padding:"4px 0"}} />;
  if (d["text/latex"]) {
    const tex = srcStr(d["text/latex"] as string|string[]).replace(/^\$\$?|\$\$?$/g,"");
    return <div style={{padding:"6px 0",color:dark?"#e6edf3":"#1f2328"}} dangerouslySetInnerHTML={{ __html: renderMath(tex,true) }} />;
  }
  if (d["text/html"]) return <div className={`nb-html${dark?" dark":""}`} dangerouslySetInnerHTML={{ __html: srcStr(d["text/html"] as string|string[]) }} style={{fontSize:13,fontFamily:"Inter,system-ui,sans-serif",color:dark?"#e6edf3":"#1f2328",padding:"4px 0",overflowX:"auto"}} />;
  if (d["text/plain"]) return <pre style={{ ...pre, color:dark?"#d1d5db":"#374151" }} dangerouslySetInnerHTML={{ __html: ansiHtml(srcStr(d["text/plain"] as string|string[])) }} />;
  return null;
}

// ── Markdown rendered ─────────────────────────────────────────────────────────
function buildRenderer(dark: boolean): Renderer {
  const r = new Renderer();
  r.code = ({ text, lang }) => {
    const l = lang ?? "plaintext", h = hl(text, l);
    const bg = dark?"#161b22":"#f6f8fa", fg = dark?"#e6edf3":"#1f2328", bdr = dark?"#30363d":"#d0d7de";
    return `<pre style="background:${bg};color:${fg};border:1px solid ${bdr};border-radius:6px;padding:10px 14px;font-size:12.5px;line-height:1.7;overflow-x:auto;margin:8px 0"><code class="hljs">${h}</code></pre>`;
  };
  return r;
}

// ── Code cell ─────────────────────────────────────────────────────────────────
interface CodeCellProps {
  cell:       CodeCell;
  cellIndex:  number;
  dark:       boolean;
  language:   string;
  run:        CellRun | undefined;
  kernelReady: boolean;
  onRun:      (idx:number, code:string) => void;
  /** called after Shift+Enter so parent can scroll/focus the next cell */
  onRunAdvance?: (idx:number) => void;
}

function CodeCellView({ cell, cellIndex, dark, language, run, kernelReady, onRun, onRunAdvance }: CodeCellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const cellRef     = useRef<HTMLDivElement>(null);
  const highlighted = useMemo(() => hl(srcStr(cell.source), language), [cell.source, language]);

  const execCount  = run?.executionCount ?? cell.execution_count;
  const runStatus  = run?.status ?? "idle";
  const outputs    = run?.outputs ?? cell.outputs;
  const label      = execCount != null ? `[${execCount}]` : "[ ]";
  const isRunning  = runStatus === "running" || runStatus === "queued";
  const codeBg     = dark ? "#161b22" : "#f6f8fa";
  const bdr        = dark ? "#30363d" : "#d0d7de";
  const accentRun  = dark ? "#388bfd" : "#0969da";
  const accentOut  = dark ? "#f78166" : "#bc4c00";

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey && kernelReady && !isRunning) {
      e.preventDefault();
      onRun(cellIndex, srcStr(cell.source));
      onRunAdvance?.(cellIndex);
    }
  }, [kernelReady, isRunning, onRun, onRunAdvance, cellIndex, cell.source]);

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline:"none" }}
    >
      {/* Source row */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:0 }}>
        {/* Gutter */}
        <div style={{ width:52, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", paddingRight:8, paddingTop:8, gap:4 }}>
          {/* Run button */}
          <button
            onClick={() => onRun(cellIndex, srcStr(cell.source))}
            disabled={!kernelReady || isRunning}
            title={kernelReady ? "Run cell (Shift+Enter)" : "Start kernel to run cells"}
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:22, height:22, borderRadius:4, border:"none",
              background: isRunning
                ? (dark?"rgba(56,139,253,.15)":"rgba(9,105,218,.1)")
                : kernelReady
                  ? (dark?"rgba(63,185,80,.15)":"rgba(26,127,55,.1)")
                  : "transparent",
              color: isRunning
                ? accentRun
                : kernelReady
                  ? (dark?"#3fb950":"#1a7f37")
                  : (dark?"#484f58":"#d0d7de"),
              cursor: kernelReady && !isRunning ? "pointer" : "default",
              transition:"background .1s, color .1s",
              flexShrink:0,
            }}
          >
            {isRunning
              ? <span className="nb-spin" style={{ fontSize:10 }}>◌</span>
              : <Play size={10} />
            }
          </button>

          {/* Execution count */}
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color: isRunning ? accentRun : accentRun, userSelect:"none", whiteSpace:"nowrap" }}>
            In {label}:
          </span>
        </div>

        {/* Code block */}
        <div style={{ flex:1, borderRadius:6, border:`1px solid ${isRunning ? accentRun : bdr}`, background:codeBg, overflow:"hidden", minWidth:0, transition:"border-color .15s" }}>
          <pre className={`hljs${dark?" dark":""}`}
            style={{ margin:0, padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:12.5, lineHeight:1.7, color:dark?"#e6edf3":"#1f2328", background:"transparent", whiteSpace:"pre-wrap", wordBreak:"break-word", overflowX:"auto" }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>

      {/* Output row */}
      {outputs.length > 0 && (
        <div style={{ display:"flex", alignItems:"flex-start", marginTop:2 }}>
          <div style={{ width:52, flexShrink:0, paddingTop:6, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:accentOut, userSelect:"none", paddingRight:8 }}>
              Out {label}:
            </span>
            <button onClick={() => setCollapsed(v=>!v)}
              style={{ background:"transparent", border:"none", cursor:"pointer", color:dark?"#484f58":"#8c959f", padding:0, paddingRight:6, display:"flex", alignItems:"center" }}>
              {collapsed ? <ChevronRight size={11}/> : <ChevronDown size={11}/>}
            </button>
          </div>
          {collapsed
            ? <div style={{ flex:1, height:20, borderRadius:3, background:codeBg, border:`1px solid ${bdr}`, cursor:"pointer" }} onClick={()=>setCollapsed(false)} />
            : <div style={{ flex:1, minWidth:0, borderRadius:6, border:`1px solid ${bdr}`, background:dark?"#0d1117":"#fff", overflow:"hidden" }}>
                {outputs.map((o,i) => <OutputView key={i} output={o} dark={dark} />)}
              </div>
          }
        </div>
      )}
    </div>
  );
}

function MarkdownCellView({ cell, dark }: { cell:MarkdownCell; dark:boolean }) {
  const html = useMemo(() => {
    return marked.parse(preprocessMath(srcStr(cell.source)), { renderer: buildRenderer(dark) }) as string;
  }, [cell.source, dark]);
  return <div className={`md-preview${dark?" dark":""}`} dangerouslySetInnerHTML={{ __html: html }} style={{ paddingLeft:52 }} />;
}

function RawCellView({ cell, dark }: { cell:RawCell; dark:boolean }) {
  return (
    <div style={{ display:"flex" }}>
      <div style={{ width:52, flexShrink:0 }} />
      <pre style={{ flex:1, margin:0, padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, lineHeight:1.6, color:dark?"#8b949e":"#6e7781", whiteSpace:"pre-wrap", wordBreak:"break-word", borderLeft:`2px solid ${dark?"#30363d":"#d0d7de"}` }}>
        {srcStr(cell.source)}
      </pre>
    </div>
  );
}

// ── Kernel connection hook ─────────────────────────────────────────────────────

function useKernel(notebookPath: string, kernelName: string) {
  const [ctx, setCtx]       = useState<KernelCtx>({ status: "idle" });
  const [cellRuns, setCellRuns] = useState<Map<number, CellRun>>(new Map());
  // msgId → cellIndex
  const pending = useRef<Map<string, number>>(new Map());
  const wsRef   = useRef<WebSocket | null>(null);
  const pidRef  = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (pidRef.current !== null) {
        invoke("stop_jupyter_server", { pid: pidRef.current }).catch(() => {});
      }
    };
  }, []);

  const handleMessage = useCallback((ev: MessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
    catch { return; }

    const msgType   = msg.msg_type as string;
    const header    = msg.parent_header as Record<string,unknown> | undefined;
    const parentId  = header?.msg_id as string | undefined;
    const content   = msg.content as Record<string,unknown>;

    // Kernel status changes (iopub)
    if (msgType === "status") {
      const exec = content.execution_state as string;
      setCtx(c => ({ ...c, status: exec === "busy" ? "busy" : "ready" }));
      return;
    }

    if (!parentId) return;
    const cellIdx = pending.current.get(parentId);
    if (cellIdx === undefined) return;

    if (msgType === "stream") {
      const name = content.name as "stdout" | "stderr";
      const text = content.text as string;
      setCellRuns(prev => {
        const next = new Map(prev);
        const cur  = next.get(cellIdx) ?? { status:"running" as const, outputs:[] };
        const outs = [...cur.outputs];
        const last = outs[outs.length - 1];
        if (last?.output_type === "stream" && (last as StreamOutput).name === name) {
          outs[outs.length - 1] = { ...last, text: (srcStr((last as StreamOutput).text)) + text } as StreamOutput;
        } else {
          outs.push({ output_type:"stream", name, text } as StreamOutput);
        }
        next.set(cellIdx, { ...cur, outputs: outs });
        return next;
      });
    }

    else if (msgType === "display_data" || msgType === "execute_result") {
      const out: Output = {
        output_type:     msgType as "display_data" | "execute_result",
        data:            content.data as OutputData,
        metadata:        (content.metadata ?? {}) as Record<string,unknown>,
        ...(msgType === "execute_result" ? { execution_count: content.execution_count as number } : {}),
      } as Output;
      setCellRuns(prev => {
        const next = new Map(prev);
        const cur  = next.get(cellIdx) ?? { status:"running" as const, outputs:[] };
        next.set(cellIdx, { ...cur, outputs: [...cur.outputs, out] });
        return next;
      });
    }

    else if (msgType === "error") {
      const out: ErrorOutput = {
        output_type: "error",
        ename:       content.ename as string,
        evalue:      content.evalue as string,
        traceback:   content.traceback as string[],
      };
      setCellRuns(prev => {
        const next = new Map(prev);
        const cur  = next.get(cellIdx) ?? { status:"running" as const, outputs:[] };
        next.set(cellIdx, { ...cur, outputs: [...cur.outputs, out], status:"error" });
        return next;
      });
    }

    else if (msgType === "execute_reply") {
      const execCount = content.execution_count as number;
      const ok        = content.status === "ok";
      setCellRuns(prev => {
        const next = new Map(prev);
        const cur  = next.get(cellIdx) ?? { status:"running" as const, outputs:[] };
        next.set(cellIdx, { ...cur, status: ok?"done":"error", executionCount: execCount });
        return next;
      });
      pending.current.delete(parentId);
    }
  }, []);

  const connectWs = useCallback((port: number, token: string, kernelId: string) => {
    const url = `ws://127.0.0.1:${port}/api/kernels/${kernelId}/channels?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = handleMessage;
    ws.onerror   = () => setCtx(c => ({ ...c, status:"error", error:"WebSocket error" }));
    ws.onclose   = () => {};
  }, [handleMessage]);

  const startKernel = useCallback(async () => {
    setCtx({ status:"starting" });
    setCellRuns(new Map());
    try {
      const info = await invoke<JupyterInfo>("start_jupyter_server", { notebookPath });
      pidRef.current = info.pid;

      // Create a kernel session via REST
      const resp = await fetch(`http://127.0.0.1:${info.port}/api/sessions`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `token ${info.token}`,
        },
        body: JSON.stringify({
          kernel: { name: kernelName || "python3" },
          name:   info.filename,
          path:   info.filename,
          type:   "notebook",
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(`Session creation failed (${resp.status}): ${txt}`);
      }

      const session = await resp.json() as { id:string; kernel:{ id:string } };

      setCtx({
        status:    "ready",
        port:      info.port,
        token:     info.token,
        pid:       info.pid,
        kernelId:  session.kernel.id,
        sessionId: session.id,
      });

      connectWs(info.port, info.token, session.kernel.id);
    } catch (e: unknown) {
      pidRef.current = null;
      setCtx({ status:"error", error: String(e) });
    }
  }, [notebookPath, kernelName, connectWs]);

  const stopKernel = useCallback(async () => {
    wsRef.current?.close();
    wsRef.current = null;
    pending.current.clear();
    const pid = pidRef.current;
    pidRef.current = null;
    setCtx({ status:"idle" });
    setCellRuns(new Map());
    if (pid !== null) await invoke("stop_jupyter_server", { pid }).catch(() => {});
  }, []);

  const restartKernel = useCallback(async () => {
    if (!ctx.kernelId || !ctx.port || !ctx.token) return;
    setCtx(c => ({ ...c, status:"restarting" }));
    setCellRuns(new Map());
    pending.current.clear();
    try {
      await fetch(`http://127.0.0.1:${ctx.port}/api/kernels/${ctx.kernelId}/restart`, {
        method:  "POST",
        headers: { "Authorization": `token ${ctx.token}` },
      });
      setCtx(c => ({ ...c, status:"ready" }));
    } catch (e: unknown) {
      setCtx(c => ({ ...c, status:"error", error: String(e) }));
    }
  }, [ctx]);

  const runCell = useCallback((cellIndex: number, code: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || ctx.status !== "ready") return;
    if (!code.trim()) return; // skip empty cells

    const msgId = crypto.randomUUID();
    pending.current.set(msgId, cellIndex);

    setCellRuns(prev => {
      const next = new Map(prev);
      next.set(cellIndex, { status:"running", outputs:[] });
      return next;
    });

    ws.send(JSON.stringify({
      header: {
        msg_id:   msgId,
        msg_type: "execute_request",
        session:  ctx.sessionId ?? "",
        username: "",
        version:  "5.3",
        date:     new Date().toISOString(),
      },
      parent_header: {},
      metadata:      {},
      content: {
        code,
        silent:           false,
        store_history:    true,
        user_expressions: {},
        allow_stdin:      false,
      },
      channel: "shell",
    }));
  }, [ctx]);

  const runAll = useCallback((cells: Cell[]) => {
    // Run all code cells in order
    cells.forEach((cell, i) => {
      if (cell.cell_type === "code" && srcStr(cell.source).trim()) {
        runCell(i, srcStr(cell.source));
      }
    });
  }, [runCell]);

  return { ctx, cellRuns, startKernel, stopKernel, restartKernel, runCell, runAll };
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props { tab:FileTab; visible:boolean; }

export function NotebookViewerTab({ tab, visible }: Props) {
  const [dark, setDark] = useState(false);
  useEffect(() => { injectCss(); }, []);

  const notebook = useMemo<Notebook | null>(() => {
    const raw = tabContentMap.get(tab.path);
    if (!raw) return null;
    try { return JSON.parse(raw) as Notebook; }
    catch { return null; }
  }, [tab.path]);

  const kernelName = notebook?.metadata?.kernelspec?.name ?? "python3";
  const language   = notebook?.metadata?.kernelspec?.language
    ?? notebook?.metadata?.language_info?.name ?? "python";
  const kernelLabel = notebook?.metadata?.kernelspec?.display_name
    ?? notebook?.metadata?.language_info?.name ?? null;
  const kernelVer   = notebook?.metadata?.language_info?.version ?? null;

  const { ctx, cellRuns, startKernel, stopKernel, restartKernel, runCell, runAll } =
    useKernel(tab.path, kernelName);

  const kernelReady  = ctx.status === "ready";
  const cellRefs     = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleRunAdvance = useCallback((idx: number) => {
    // Focus the next code cell after Shift+Enter
    if (!notebook) return;
    for (let i = idx + 1; i < notebook.cells.length; i++) {
      const el = cellRefs.current.get(i);
      if (el) { el.focus(); el.scrollIntoView({ block:"nearest", behavior:"smooth" }); break; }
    }
  }, [notebook]);

  const bg     = dark ? "#0d1117" : "#ffffff";
  const barBg  = dark ? "rgba(22,27,34,.92)"  : "rgba(246,248,250,.92)";
  const barBdr = dark ? "rgba(48,54,61,.8)"   : "rgba(208,215,222,.8)";
  const barFg  = dark ? "#8b949e" : "#57606a";
  const iconFg = dark ? "#e6edf3" : "#1f2328";
  const fileName = tab.path.split("/").pop() ?? tab.path;

  // Kernel status pill
  const statusDot = (
    ctx.status === "idle"       ? null :
    ctx.status === "starting"   ? <span className="nb-spin" style={{display:"inline-block",marginRight:4}}>⏺</span> :
    ctx.status === "restarting" ? <span className="nb-spin" style={{display:"inline-block",marginRight:4}}>⏺</span> :
    ctx.status === "ready"      ? <span style={{color:dark?"#3fb950":"#1a7f37",marginRight:4}}>●</span> :
    ctx.status === "busy"       ? <span style={{color:dark?"#e3b341":"#9a6700",marginRight:4}}>●</span> :
    ctx.status === "error"      ? <span style={{color:"#ef4444",marginRight:4}}>●</span> :
    null
  );
  const statusLabel =
    ctx.status === "idle"       ? "" :
    ctx.status === "starting"   ? "starting…" :
    ctx.status === "restarting" ? "restarting…" :
    ctx.status === "ready"      ? "idle" :
    ctx.status === "busy"       ? "busy" :
    ctx.status === "error"      ? "error" :
    "";

  return (
    <div style={{ display:visible?"flex":"none", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden", background:bg }}>

      {/* ── Top bar ── */}
      <div style={{
        display:"flex", alignItems:"center", gap:8, padding:"0 10px", height:36,
        borderBottom:`1px solid ${barBdr}`, background:barBg,
        backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
        flexShrink:0, fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:barFg,
      }}>
        <FileText size={13} style={{ color:dark?"#58a6ff":"#0969da", flexShrink:0 }} />
        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {fileName}
        </span>

        {/* Kernel status */}
        {ctx.status !== "idle" && (
          <span style={{ display:"flex", alignItems:"center", fontSize:10, color:barFg, flexShrink:0, gap:2 }}>
            {statusDot}{statusLabel}
          </span>
        )}

        {/* Kernel badge */}
        {kernelLabel && (
          <span style={{
            padding:"2px 7px", borderRadius:4, flexShrink:0,
            background:dark?"rgba(88,166,255,.1)":"rgba(9,105,218,.07)",
            border:`1px solid ${dark?"rgba(88,166,255,.25)":"rgba(9,105,218,.2)"}`,
            color:dark?"#79c0ff":"#0550ae", fontSize:10,
          }}>
            {kernelLabel}{kernelVer ? ` ${kernelVer}` : ""}
          </span>
        )}

        {/* Cell count */}
        {notebook && (
          <span style={{ fontSize:10, color:dark?"#484f58":"#bbbfc2", flexShrink:0 }}>
            {notebook.cells.length} cells
          </span>
        )}

        {/* Action buttons */}
        {ctx.status === "idle" || ctx.status === "error" ? (
          <Btn
            onClick={startKernel}
            icon={<Play size={10}/>}
            label="Start Kernel"
            color={dark?"#3fb950":"#1a7f37"}
            bg={dark?"rgba(63,185,80,.1)":"rgba(26,127,55,.08)"}
            bdr={dark?"rgba(63,185,80,.4)":"rgba(26,127,55,.4)"}
          />
        ) : ctx.status === "starting" || ctx.status === "restarting" ? (
          <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:barFg, flexShrink:0 }}>
            <Loader size={11} className="animate-spin" />
          </span>
        ) : (
          <>
            {/* Run all */}
            <Btn
              onClick={() => notebook && runAll(notebook.cells)}
              icon={<PlayCircle size={11}/>}
              label="Run All"
              color={dark?"#3fb950":"#1a7f37"}
              bg={dark?"rgba(63,185,80,.08)":"rgba(26,127,55,.05)"}
              bdr={dark?"rgba(63,185,80,.3)":"rgba(26,127,55,.3)"}
              disabled={!kernelReady}
            />
            {/* Restart */}
            <Btn
              onClick={restartKernel}
              icon={<RotateCcw size={11}/>}
              label="Restart"
              color={dark?"#e3b341":"#9a6700"}
              bg={dark?"rgba(227,179,65,.08)":"rgba(154,103,0,.05)"}
              bdr={dark?"rgba(227,179,65,.3)":"rgba(154,103,0,.3)"}
              disabled={!kernelReady}
            />
            {/* Stop */}
            <Btn
              onClick={stopKernel}
              icon={<Square size={10}/>}
              label="Stop"
              color={dark?"#f87171":"#dc2626"}
              bg={dark?"rgba(248,113,113,.1)":"rgba(220,38,38,.07)"}
              bdr={dark?"rgba(248,113,113,.4)":"rgba(220,38,38,.35)"}
            />
          </>
        )}

        {/* Dark/light */}
        <button onClick={() => setDark(v=>!v)}
          style={{ display:"flex", alignItems:"center", justifyContent:"center", width:26, height:26, borderRadius:4, border:"none", background:"transparent", color:barFg, cursor:"pointer", transition:"background .1s, color .1s" }}
          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color=iconFg; el.style.background=dark?"rgba(48,54,61,.6)":"rgba(208,215,222,.4)"; }}
          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color=barFg; el.style.background="transparent"; }}
        >
          {dark ? <Sun size={13}/> : <Moon size={13}/>}
        </button>
      </div>

      {/* ── Error banner ── */}
      {ctx.status === "error" && ctx.error && (
        <div style={{
          display:"flex", alignItems:"flex-start", gap:8, padding:"8px 16px",
          background:dark?"rgba(239,68,68,.12)":"rgba(254,226,226,.7)",
          borderBottom:`1px solid ${dark?"rgba(239,68,68,.3)":"rgba(220,38,38,.2)"}`,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:dark?"#f87171":"#dc2626",
          flexShrink:0,
        }}>
          <AlertCircle size={14} style={{ marginTop:1, flexShrink:0 }} />
          <div style={{ whiteSpace:"pre-wrap" }}>{ctx.error}</div>
        </div>
      )}

      {/* ── Notebook cells ── */}
      <div style={{ flex:1, overflowY:"auto", background:bg }}>
        {!notebook ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:dark?"#8b949e":"#57606a" }}>
            Failed to parse notebook
          </div>
        ) : (
          <div className={dark?"dark":""} style={{ padding:"28px 40px", maxWidth:1020 }}>
            {notebook.cells.map((cell, i) => (
              <div
                key={i}
                ref={(el) => { if (el) cellRefs.current.set(i, el); else cellRefs.current.delete(i); }}
                style={{ marginBottom:16, paddingBottom:16, borderBottom:`1px solid ${dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)"}` }}
              >
                {cell.cell_type === "code" && (
                  <CodeCellView
                    cell={cell as CodeCell}
                    cellIndex={i}
                    dark={dark}
                    language={language}
                    run={cellRuns.get(i)}
                    kernelReady={kernelReady}
                    onRun={runCell}
                    onRunAdvance={handleRunAdvance}
                  />
                )}
                {cell.cell_type === "markdown" && <MarkdownCellView cell={cell as MarkdownCell} dark={dark} />}
                {cell.cell_type === "raw"      && <RawCellView      cell={cell as RawCell}      dark={dark} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small toolbar button ──────────────────────────────────────────────────────
function Btn({ onClick, icon, label, color, bg, bdr, disabled }: {
  onClick:   () => void;
  icon:      React.ReactNode;
  label:     string;
  color:     string;
  bg:        string;
  bdr:       string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:"flex", alignItems:"center", gap:5,
        padding:"3px 8px", borderRadius:4,
        border:`1px solid ${bdr}`, background:bg,
        color: disabled ? "rgba(128,128,128,.5)" : color,
        fontSize:11, fontFamily:"'JetBrains Mono',monospace",
        cursor: disabled ? "default" : "pointer",
        flexShrink:0, opacity: disabled ? 0.6 : 1,
        transition:"background .1s",
      }}
    >
      {icon}{label}
    </button>
  );
}
