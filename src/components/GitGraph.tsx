/**
 * GitGraph — branch visualiser.
 *
 * Lane algorithm (one pass, newest-first):
 *   lanes[i] = full_oid this lane is "waiting for" (tracking downward).
 *   Per commit:
 *   1. matchSlots = all i where lanes[i] === full_oid
 *   2. col = matchSlots[0]  OR  first free/new slot
 *   3. Snapshot before/after lane states for SVG drawing
 *   4. lanes[col] = parents[0]; free matchSlots[1..] (converging); allocate
 *      new slots for parents[1..] (merge parents).
 *
 * SVG drawing uses BOTH the before and after state so every transition is
 * drawn correctly without gaps or phantom lines.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { RefreshCw, Copy, FileText } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W  = 16;
const ROW_H  = 28;
const DOT_R  = 4;
const STROKE = 1.6;
const HALF   = COL_W / 2;

const PALETTE = [
  "#61AFEF", // blue
  "#98C379", // green
  "#C678DD", // purple
  "#E5C07B", // yellow
  "#56B6C2", // cyan
  "#E06C75", // red
  "#D19A66", // orange
  "#7B93D8", // lavender
  "#4EC9B0", // teal
  "#CE9178", // peach
  "#C586C0", // pink
  "#9CDCFE", // light blue
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GraphCommit {
  oid:      string;
  full_oid: string;
  parents:  string[];
  refs:     string[];
  message:  string;
  author:   string;
  time:     number;
}

interface MergeTarget {
  col:   number;
  color: string;
}

interface RowLayout {
  commit:          GraphCommit;
  col:             number;
  color:           string;
  /** Lane state at the TOP of this row (before this commit is processed). */
  before:          (string | null)[];
  beforeColors:    string[];
  /** Lane state at the BOTTOM of this row (after this commit is processed). */
  after:           (string | null)[];
  afterColors:     string[];
  /** Slots (≠ col) that were also tracking this commit — they curve into the dot. */
  convergingCols:  number[];
  /** New/existing slots allocated for merge parents (parents[1+]). */
  mergeTargets:    MergeTarget[];
}

// ── Lane algorithm ────────────────────────────────────────────────────────────
function computeLayout(commits: GraphCommit[]): { rows: RowLayout[]; maxCols: number } {
  const lanes:  (string | null)[] = [];
  const colors: string[]          = [];
  let   colorIdx = 0;

  const alloc    = ()        => PALETTE[colorIdx++ % PALETTE.length];
  const findFree = ()        => { const i = lanes.indexOf(null); return i >= 0 ? i : lanes.length; };
  const ensure   = (i: number) => { while (lanes.length <= i) { lanes.push(null); colors.push(""); } };

  const rows: RowLayout[] = [];
  let maxCols = 1;

  for (const commit of commits) {
    const { full_oid, parents } = commit;

    // 1. Which existing slots track this commit?
    const matchSlots: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === full_oid) matchSlots.push(i);
    }

    // 2. Assign column + colour (single alloc, no double nextColor)
    let col: number, color: string;
    if (matchSlots.length > 0) {
      col   = matchSlots[0];
      color = colors[col];
    } else {
      col   = findFree();
      color = alloc();
    }
    ensure(col);
    colors[col] = color; // idempotent for existing, sets correct colour for new

    // 3. Snapshot BEFORE (lanes already in correct state at this point)
    const before       = [...lanes];
    const beforeColors = [...colors];

    // 4a. Primary parent occupies col
    lanes[col]  = parents[0] ?? null;
    colors[col] = color;

    // 4b. Free converging slots
    const convergingCols = matchSlots.slice(1);
    for (const ci of convergingCols) lanes[ci] = null;

    // 4c. Merge parents get new/existing slots
    const mergeTargets: MergeTarget[] = [];
    for (let pi = 1; pi < parents.length; pi++) {
      const pOid  = parents[pi];
      const exist = lanes.indexOf(pOid);
      if (exist >= 0) {
        mergeTargets.push({ col: exist, color: colors[exist] });
      } else {
        const nc = findFree();
        const c  = alloc();
        ensure(nc);
        lanes[nc]  = pOid;
        colors[nc] = c;
        mergeTargets.push({ col: nc, color: c });
      }
    }

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
      colors.pop();
    }

    const after       = [...lanes];
    const afterColors = [...colors];

    maxCols = Math.max(maxCols, col + 1, before.length, after.length);

    rows.push({ commit, col, color, before, beforeColors, after, afterColors, convergingCols, mergeTargets });
  }

  return { rows, maxCols };
}

// ── SVG path builder ──────────────────────────────────────────────────────────
function buildPaths(row: RowLayout): React.ReactElement[] {
  const { before, beforeColors, after, col, color, convergingCols, mergeTargets, commit } = row;
  const full_oid = commit.full_oid;
  const cx = col * COL_W + HALF;
  const cy = ROW_H / 2;
  const n  = Math.max(before.length, after.length, col + 1);
  const elems: React.ReactElement[] = [];

  for (let i = 0; i < n; i++) {
    const bOid  = before[i] ?? null;
    const aOid  = after[i]  ?? null;
    const bClr  = beforeColors[i] || "#555";
    const x     = i * COL_W + HALF;

    if (i === col) {
      // Incoming top-half line (if this lane was tracking this commit)
      if (bOid === full_oid) {
        elems.push(<line key="in" x1={cx} y1={0} x2={cx} y2={cy}
          stroke={color} strokeWidth={STROKE} strokeLinecap="round" />);
      }
      // Outgoing bottom-half line (if commit has a primary parent)
      if (commit.parents.length > 0) {
        elems.push(<line key="out" x1={cx} y1={cy} x2={cx} y2={ROW_H}
          stroke={color} strokeWidth={STROKE} strokeLinecap="round" />);
      }
    } else if (convergingCols.includes(i)) {
      // This lane was also tracking this commit — curve it into the dot
      const d = `M ${x} 0 C ${x} ${cy * 0.55} ${cx} ${cy * 0.8} ${cx} ${cy}`;
      elems.push(<path key={`conv-${i}`} d={d}
        stroke={bClr} strokeWidth={STROKE} fill="none" strokeLinecap="round" />);
    } else if (bOid && bOid === aOid) {
      // Pure pass-through: same oid coming in and going out
      elems.push(<line key={`pass-${i}`} x1={x} y1={0} x2={x} y2={ROW_H}
        stroke={bClr} strokeWidth={STROKE} strokeLinecap="round" />);
    } else if (bOid && !aOid) {
      // Lane ends here for a reason other than converging — draw the top half
      elems.push(<line key={`end-${i}`} x1={x} y1={0} x2={x} y2={cy}
        stroke={bClr} strokeWidth={STROKE} strokeLinecap="round" />);
    }
    // !bOid && aOid: newly allocated merge-parent lane — covered by mergeTargets bezier below
  }

  // Merge-parent beziers (commit dot → bottom of merge lane)
  for (const mt of mergeTargets) {
    const tx     = mt.col * COL_W + HALF;
    const ctrl1y = cy + (ROW_H - cy) * 0.45;
    const ctrl2y = ROW_H - (ROW_H - cy) * 0.2;
    const d = `M ${cx} ${cy} C ${cx} ${ctrl1y} ${tx} ${ctrl2y} ${tx} ${ROW_H}`;
    elems.push(<path key={`mt-${mt.col}`} d={d}
      stroke={mt.color} strokeWidth={STROKE} fill="none" strokeLinecap="round" />);
  }

  return elems;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(ts: number): string {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60)         return `${d}s`;
  if (d < 3600)       return `${Math.floor(d / 60)}m`;
  if (d < 86400)      return `${Math.floor(d / 3600)}h`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Ref badge ─────────────────────────────────────────────────────────────────
function RefBadge({ name }: { name: string }) {
  const isHead   = name === "HEAD";
  const isTag    = name.startsWith("tag: ");
  const isRemote = !isHead && !isTag && name.includes("/");
  const label    = isTag ? name.slice(5) : name;
  const short    = label.length > 18 ? label.slice(0, 17) + "…" : label;

  const cls = isHead
    ? "bg-red-500/20 text-red-400 border-red-500/40"
    : isTag
    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/35"
    : isRemote
    ? "bg-white/5 text-editor-comment border-white/15"
    : "bg-blue-500/15 text-blue-400 border-blue-500/30";

  return (
    <span title={label}
      className={`inline-flex items-center shrink-0 px-1 py-px rounded text-[9px] font-mono font-semibold border leading-[1.6] ${cls}`}>
      {short}
    </span>
  );
}

// ── Single graph row ──────────────────────────────────────────────────────────
function GraphRow({
  row, svgW, selected, onSelect,
}: {
  row:      RowLayout;
  svgW:     number;
  selected: boolean;
  onSelect: () => void;
}) {
  const cx    = row.col * COL_W + HALF;
  const cy    = ROW_H / 2;
  const paths = buildPaths(row);
  const hasRefs = row.commit.refs.length > 0;

  return (
    <div
      role="row"
      className={`group flex items-center cursor-pointer select-none transition-colors ${
        selected ? "bg-blue-500/10" : "hover:bg-white/[0.04]"
      }`}
      style={{ height: ROW_H, minHeight: ROW_H }}
      onClick={onSelect}
    >
      {/* Graph SVG */}
      <svg width={svgW} height={ROW_H} style={{ flexShrink: 0 }}>
        {paths}
        {/* Glow ring for commits with refs */}
        {hasRefs && (
          <circle cx={cx} cy={cy} r={DOT_R + 2.5} fill={row.color} opacity={0.2} />
        )}
        {/* Dot */}
        <circle cx={cx} cy={cy} r={DOT_R}
          fill={selected ? "#fff" : row.color}
          stroke={row.color}
          strokeWidth={selected ? 1.5 : 0}
        />
        {/* Inner highlight */}
        <circle cx={cx - 1} cy={cy - 1} r={DOT_R * 0.38} fill="white" opacity={0.3} />
      </svg>

      {/* Commit info */}
      <div className="flex-1 min-w-0 flex items-center gap-1 pl-1 pr-1.5 overflow-hidden">
        {/* Ref badges — up to 2 visible */}
        {row.commit.refs.slice(0, 2).map((r) => <RefBadge key={r} name={r} />)}
        {row.commit.refs.length > 2 && (
          <span className="text-[9px] text-editor-comment shrink-0 font-mono">
            +{row.commit.refs.length - 2}
          </span>
        )}

        {/* Message */}
        <span className="text-[11px] truncate text-editor-fg/90 leading-none">
          {row.commit.message}
        </span>
      </div>

      {/* Right meta — always visible but dim, brighter on hover/select */}
      <div className={`flex items-center gap-2 shrink-0 pr-2 transition-opacity ${
        selected ? "opacity-100" : "opacity-30 group-hover:opacity-70"
      }`}>
        <span className="text-[9px] font-mono text-editor-comment">{row.commit.oid}</span>
        <span className="text-[9px] text-editor-comment shrink-0">{relTime(row.commit.time)}</span>
      </div>
    </div>
  );
}

// ── Commit detail panel ───────────────────────────────────────────────────────
function CommitDetail({
  commit, repoPath, onClose,
}: {
  commit:   GraphCommit;
  repoPath: string;
  onClose:  () => void;
}) {
  const [files,   setFiles]   = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<string[]>("git_commit_files", { repoPath, oid: commit.oid })
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [commit.oid, repoPath]);

  const copyHash = () => navigator.clipboard.writeText(commit.full_oid);

  return (
    <div className="border-t border-editor-border shrink-0 overflow-y-auto"
         style={{ maxHeight: 200, background: "rgb(var(--c-deep))" }}>
      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-2 pb-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-editor-fg leading-snug mb-1">{commit.message}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyHash}
              className="flex items-center gap-0.5 text-[10px] font-mono text-blue-400 hover:text-editor-fg transition-colors"
              title="Copy full hash">
              <span>{commit.full_oid.slice(0, 12)}</span>
              <Copy size={9} />
            </button>
            <span className="text-[10px] text-editor-comment">{commit.author}</span>
            <span className="text-[10px] text-editor-comment ml-auto">{relTime(commit.time)}</span>
          </div>
          {commit.refs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {commit.refs.map((r) => <RefBadge key={r} name={r} />)}
            </div>
          )}
        </div>
        <button onClick={onClose}
          className="text-editor-comment hover:text-editor-fg transition-colors text-xs px-1 shrink-0 mt-0.5">
          ✕
        </button>
      </div>

      {/* Files */}
      <div className="border-t border-editor-border/40 pb-1">
        <p className="px-3 py-1 text-[9px] font-sans font-semibold uppercase tracking-widest text-editor-comment">
          {loading ? "Loading…" : `${files.length} file${files.length !== 1 ? "s" : ""} changed`}
        </p>
        {files.map((entry, i) => {
          const parts  = entry.split("\t");
          const status = parts[0] ?? "";
          const path   = parts[1] ?? entry;
          const clr    = status === "A" ? "text-editor-green"
                       : status === "D" ? "text-editor-red"
                       : "text-editor-yellow";
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-0.5 hover:bg-editor-line transition-colors">
              <span className={`w-3 text-[10px] font-mono font-bold shrink-0 ${clr}`}>{status || "M"}</span>
              <FileText size={9} className="text-editor-comment shrink-0" />
              <span className="text-[10px] text-editor-fg font-mono truncate">{path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function GitGraph() {
  const workspaceRoot = useStore((s) => s.workspaceRoot);

  const [rows,     setRows]     = useState<RowLayout[]>([]);
  const [svgW,     setSvgW]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphCommit | null>(null);
  const [limit,    setLimit]    = useState(200);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback((lim: number) => {
    if (!workspaceRoot) return;
    setLoading(true);
    setError(null);
    invoke<GraphCommit[]>("git_graph", { repoPath: workspaceRoot, limit: lim })
      .then((commits) => {
        const { rows: r, maxCols } = computeLayout(commits);
        setRows(r);
        // +1 col of padding so the rightmost dot isn't flush against the edge
        setSvgW((maxCols + 1) * COL_W);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workspaceRoot]);

  useEffect(() => { load(limit); }, [load, limit]);

  const handleSelect = (row: RowLayout) => {
    setSelected((prev) => prev?.full_oid === row.commit.full_oid ? null : row.commit);
  };

  if (!workspaceRoot) {
    return (
      <div className="flex-1 flex items-center justify-center text-editor-comment text-xs">
        Open a folder to view the graph
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-editor-border shrink-0">
        <span className="text-[10px] text-editor-comment font-sans flex-1">
          {loading ? "Loading…" : `${rows.length} commits`}
        </span>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="text-[10px] bg-transparent text-editor-comment border border-editor-border/60 rounded px-1 py-px outline-none hover:text-editor-fg cursor-pointer"
        >
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
        <button onClick={() => load(limit)}
          className="text-editor-comment hover:text-editor-fg transition-colors"
          title="Refresh">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-editor-red border-b border-editor-border shrink-0 font-mono">
          {error}
        </div>
      )}

      {/* Graph list */}
      <div ref={listRef} className="flex-1 overflow-auto" style={{ scrollbarWidth: "thin" }}>
        {rows.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full text-editor-comment text-xs">
            No commits yet
          </div>
        ) : (
          rows.map((row) => (
            <GraphRow
              key={row.commit.full_oid}
              row={row}
              svgW={svgW}
              selected={selected?.full_oid === row.commit.full_oid}
              onSelect={() => handleSelect(row)}
            />
          ))
        )}

        {rows.length >= limit && (
          <button
            onClick={() => setLimit((l) => l + 200)}
            className="w-full py-2 text-[10px] text-editor-comment hover:text-editor-fg hover:bg-editor-line transition-colors font-sans"
          >
            Load 200 more…
          </button>
        )}
      </div>

      {/* Commit detail */}
      {selected && (
        <CommitDetail
          commit={selected}
          repoPath={workspaceRoot}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
