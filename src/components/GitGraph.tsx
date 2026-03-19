/**
 * GitGraph — branch visualizer.
 *
 * Renders a scrollable commit graph (like GitKraken / git log --graph)
 * using a lane-assignment algorithm + per-row inline SVG.
 *
 * Layout algorithm (one pass, top-to-bottom):
 *   lanes[i] = full_oid of the commit this lane is currently "waiting for".
 *   For each commit:
 *     1. Find all lane slots that hold this commit's full_oid → matchSlots.
 *     2. Assign commit to matchSlots[0] (primary) or a new/free slot.
 *     3. Set primary slot → primary parent; free all other matching slots.
 *     4. Allocate new slots for any additional merge parents.
 *   Each row's SVG then draws:
 *     - Straight pass-through lines for unchanged lanes.
 *     - Converging bezier curves for collapsed lanes.
 *     - Diagonal bezier curves for merge-parent edges.
 *     - The commit dot.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { RefreshCw, Copy, FileText, GitCommit as CommitIcon } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W  = 14;   // px per lane column
const ROW_H  = 26;   // px per commit row
const DOT_R  = 3.5;  // commit dot radius
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

interface RowLayout {
  commit:          GraphCommit;
  col:             number;
  color:           string;
  /** Lane slot states BEFORE this commit was processed (for drawing incoming lines). */
  incomingSlots:   (string | null)[];
  incomingColors:  string[];
  /** Slots from `incomingSlots` that pointed to this commit and were freed (they converge into `col`). */
  convergingCols:  number[];
  /** New lanes allocated for merge parents (parents[1+]). */
  mergeTargets:    { col: number; color: string }[];
}

// ── Lane algorithm ────────────────────────────────────────────────────────────
function computeLayout(commits: GraphCommit[]): { rows: RowLayout[]; maxCols: number } {
  const lanes: (string | null)[] = [];
  const laneColors: string[] = [];
  let colorIdx = 0;

  const nextColor  = () => PALETTE[colorIdx++ % PALETTE.length];
  const findFree   = () => { const i = lanes.indexOf(null); return i >= 0 ? i : lanes.length; };
  const ensureSlot = (i: number) => {
    while (lanes.length <= i) { lanes.push(null); laneColors.push(nextColor()); }
  };

  const rows: RowLayout[] = [];
  let maxCols = 1;

  for (const commit of commits) {
    const { full_oid, parents } = commit;

    // 1. Find all slots already tracking this commit
    const matchSlots: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === full_oid) matchSlots.push(i);
    }

    // 2. Assign commit column
    let col: number;
    let color: string;
    if (matchSlots.length > 0) {
      col   = matchSlots[0];
      color = laneColors[col];
    } else {
      col = findFree();
      ensureSlot(col);
      color = nextColor();
      laneColors[col] = color;
    }

    // Snapshot incoming state (before mutation)
    const incomingSlots  = [...lanes];
    const incomingColors = [...laneColors];

    // 3. Update primary slot → primary parent (or null if root commit)
    ensureSlot(col);
    lanes[col]      = parents[0] ?? null;
    laneColors[col] = color;   // primary lineage keeps same colour

    // 4. Free converging slots (matchSlots[1..] all merged into col)
    const convergingCols = matchSlots.slice(1);
    for (const ci of convergingCols) {
      lanes[ci] = null;
    }

    // 5. Allocate slots for merge parents (parents[1+])
    const mergeTargets: { col: number; color: string }[] = [];
    for (let pi = 1; pi < parents.length; pi++) {
      const pOid  = parents[pi];
      const exist = lanes.indexOf(pOid);
      if (exist >= 0) {
        mergeTargets.push({ col: exist, color: laneColors[exist] });
      } else {
        const newCol = findFree();
        ensureSlot(newCol);
        const nc = nextColor();
        lanes[newCol]      = pOid;
        laneColors[newCol] = nc;
        mergeTargets.push({ col: newCol, color: nc });
      }
    }

    // Trim trailing nulls (keeps maxCols tight)
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
      laneColors.pop();
    }

    const rowWidth = Math.max(col + 1, lanes.length, incomingSlots.length);
    if (rowWidth > maxCols) maxCols = rowWidth;

    rows.push({ commit, col, color, incomingSlots, incomingColors, convergingCols, mergeTargets });
  }

  return { rows, maxCols };
}

// ── Time helper ───────────────────────────────────────────────────────────────
function relTime(ts: number): string {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60)         return `${d}s ago`;
  if (d < 3600)       return `${Math.floor(d / 60)}m ago`;
  if (d < 86400)      return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

// ── Per-row SVG paths ─────────────────────────────────────────────────────────
function buildPaths(row: RowLayout, svgW: number): React.ReactElement[] {
  const cx = row.col * COL_W + HALF;
  const cy = ROW_H / 2;
  const elems: React.ReactElement[] = [];

  const nSlots = Math.max(row.incomingSlots.length, row.col + 1);

  // 1. Pass-through and converging lines from above
  for (let i = 0; i < nSlots; i++) {
    const oid  = row.incomingSlots[i];
    if (!oid || i === row.col) continue;

    const x   = i * COL_W + HALF;
    const clr = row.incomingColors[i] || "#666";

    if (row.convergingCols.includes(i)) {
      // Bezier curving from slot i (top) into the commit dot
      const d = `M ${x} 0 C ${x} ${cy * 0.55} ${cx} ${cy * 0.85} ${cx} ${cy}`;
      elems.push(
        <path key={`conv-${i}`} d={d} stroke={clr} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      );
    } else {
      // Straight vertical pass-through for this lane
      elems.push(
        <line key={`pass-${i}`} x1={x} y1={0} x2={x} y2={ROW_H}
              stroke={clr} strokeWidth={1.5} strokeLinecap="round" />
      );
    }
  }

  // 2. Incoming line from above into the commit dot (primary lineage)
  if (row.incomingSlots[row.col] === row.commit.full_oid) {
    elems.push(
      <line key="in" x1={cx} y1={0} x2={cx} y2={cy}
            stroke={row.color} strokeWidth={1.5} strokeLinecap="round" />
    );
  }

  // 3. Primary parent line going straight down (same column)
  if (row.commit.parents.length > 0) {
    elems.push(
      <line key="out" x1={cx} y1={cy} x2={cx} y2={ROW_H}
            stroke={row.color} strokeWidth={1.5} strokeLinecap="round" />
    );
  }

  // 4. Merge-parent bezier curves going down and outward
  for (const mt of row.mergeTargets) {
    const tx = mt.col * COL_W + HALF;
    const ctrlY1 = cy + (ROW_H - cy) * 0.45;
    const ctrlY2 = ROW_H - (ROW_H - cy) * 0.25;
    const d = `M ${cx} ${cy} C ${cx} ${ctrlY1} ${tx} ${ctrlY2} ${tx} ${ROW_H}`;
    elems.push(
      <path key={`mt-${mt.col}`} d={d} stroke={mt.color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    );
  }

  void svgW; // width set on the <svg> element itself
  return elems;
}

// ── Ref badge ─────────────────────────────────────────────────────────────────
function RefBadge({ name }: { name: string }) {
  const isHead   = name === "HEAD";
  const isTag    = name.startsWith("tag: ");
  const isRemote = !isHead && !isTag && name.includes("/");
  const label    = isTag ? name.slice(5) : name;

  const cls = isHead
    ? "bg-editor-red/20 text-editor-red border-editor-red/40"
    : isTag
    ? "bg-editor-yellow/20 text-editor-yellow border-editor-yellow/40"
    : isRemote
    ? "bg-editor-comment/10 text-editor-comment border-editor-comment/30"
    : "bg-editor-blue/15 text-editor-blue border-editor-blue/35";

  return (
    <span className={`inline-flex items-center shrink-0 px-1 rounded text-[9px] font-mono font-semibold border leading-[1.7] ${cls}`}>
      {label}
    </span>
  );
}

// ── Commit detail panel ───────────────────────────────────────────────────────
function CommitDetail({
  commit, repoPath, onClose,
}: { commit: GraphCommit; repoPath: string; onClose: () => void }) {
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
    <div
      className="border-t border-editor-border shrink-0 overflow-y-auto"
      style={{ maxHeight: 220, background: "rgb(var(--c-deep))" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-3 py-2 gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-editor-fg font-medium leading-snug">{commit.message}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <button
              onClick={copyHash}
              className="flex items-center gap-1 text-2xs font-mono text-editor-blue hover:text-editor-fg transition-colors"
              title="Copy full hash"
            >
              <span>{commit.full_oid.slice(0, 12)}</span>
              <Copy size={9} />
            </button>
            <span className="text-2xs text-editor-comment">{commit.author}</span>
            <span className="text-2xs text-editor-comment ml-auto">{relTime(commit.time)}</span>
          </div>
          {commit.refs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {commit.refs.map((r) => <RefBadge key={r} name={r} />)}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-editor-comment hover:text-editor-fg transition-colors shrink-0 text-xs px-1"
        >
          ✕
        </button>
      </div>

      {/* Changed files */}
      <div className="border-t border-editor-border/40 pb-2">
        <div className="px-3 py-1 text-2xs font-sans font-semibold uppercase tracking-widest text-editor-comment">
          {loading ? "Loading…" : `${files.length} file${files.length !== 1 ? "s" : ""} changed`}
        </div>
        {files.map((entry, i) => {
          const parts  = entry.split("\t");
          const status = parts[0] ?? "";
          const path   = parts[1] ?? entry;
          const color  =
            status === "A" ? "text-editor-green"
            : status === "D" ? "text-editor-red"
            : "text-editor-yellow";
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-0.5 hover:bg-editor-line transition-colors">
              <span className={`w-3 text-2xs font-mono font-bold shrink-0 ${color}`}>{status || "M"}</span>
              <FileText size={9} className="text-editor-comment shrink-0" />
              <span className="text-2xs text-editor-fg font-mono truncate">{path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main GraphRow component ───────────────────────────────────────────────────
function GraphRow({
  row, svgW, selected, onSelect,
}: {
  row:      RowLayout;
  svgW:     number;
  selected: boolean;
  onSelect: () => void;
}) {
  const cx = row.col * COL_W + HALF;
  const cy = ROW_H / 2;
  const paths = buildPaths(row, svgW);
  const hasRefs = row.commit.refs.length > 0;

  return (
    <div
      className={`flex items-center cursor-pointer transition-colors select-none ${
        selected ? "bg-editor-blue/10" : "hover:bg-editor-line/60"
      }`}
      style={{ height: ROW_H, minHeight: ROW_H }}
      onClick={onSelect}
    >
      {/* Graph SVG segment for this row */}
      <svg
        width={svgW}
        height={ROW_H}
        style={{ flexShrink: 0, overflow: "visible" }}
      >
        {paths}
        {/* Outer glow ring for commits with refs */}
        {hasRefs && (
          <circle cx={cx} cy={cy} r={DOT_R + 2.5} fill={row.color} opacity={0.18} />
        )}
        {/* Commit dot */}
        <circle
          cx={cx} cy={cy} r={DOT_R}
          fill={row.color}
          stroke={selected ? "#fff" : "none"}
          strokeWidth={1.5}
        />
        {/* Inner highlight */}
        <circle cx={cx - 0.8} cy={cy - 0.8} r={DOT_R * 0.45} fill="white" opacity={0.35} />
      </svg>

      {/* Text section */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 pl-1 pr-2 overflow-hidden">
        {/* Ref badges */}
        {row.commit.refs.slice(0, 3).map((r) => <RefBadge key={r} name={r} />)}
        {row.commit.refs.length > 3 && (
          <span className="text-2xs text-editor-comment shrink-0">+{row.commit.refs.length - 3}</span>
        )}
        {/* Commit message */}
        <span className={`text-xs truncate ${selected ? "text-editor-fg" : "text-editor-fg/90"}`}>
          {row.commit.message}
        </span>
      </div>

      {/* Author + time — only visible on hover / selection */}
      <div
        className={`flex items-center gap-2 shrink-0 pr-2 text-2xs text-editor-comment ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <CommitIcon size={9} className="shrink-0" />
        <span className="font-mono">{row.commit.oid}</span>
        <span className="hidden xl:block truncate max-w-[70px]">{row.commit.author.split(" ")[0]}</span>
        <span className="shrink-0">{relTime(row.commit.time)}</span>
      </div>
    </div>
  );
}

// ── GitGraph (main export) ────────────────────────────────────────────────────
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
        setSvgW(maxCols * COL_W);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workspaceRoot]);

  useEffect(() => { load(limit); }, [load, limit]);

  const handleSelect = (row: RowLayout) => {
    setSelected((prev) =>
      prev?.full_oid === row.commit.full_oid ? null : row.commit
    );
  };

  if (!workspaceRoot) {
    return (
      <div className="flex-1 flex items-center justify-center text-editor-comment text-xs">
        Open a folder to see the graph
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-editor-border shrink-0">
        <span className="text-2xs text-editor-comment font-sans flex-1">
          {loading ? "Loading…" : `${rows.length} commits`}
        </span>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="text-2xs bg-transparent text-editor-comment border border-editor-border rounded px-1 py-0.5 outline-none hover:text-editor-fg transition-colors"
        >
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
        <button
          onClick={() => load(limit)}
          className="text-editor-comment hover:text-editor-fg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 text-xs text-editor-red border-b border-editor-border shrink-0">
          {error}
        </div>
      )}

      {/* Graph list — scrollable */}
      <div
        ref={listRef}
        className="flex-1 overflow-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {rows.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-editor-comment text-xs">
            No commits yet
          </div>
        )}
        <div className="group">
          {rows.map((row) => (
            <GraphRow
              key={row.commit.full_oid}
              row={row}
              svgW={svgW}
              selected={selected?.full_oid === row.commit.full_oid}
              onSelect={() => handleSelect(row)}
            />
          ))}
        </div>

        {/* Load more */}
        {rows.length >= limit && (
          <button
            onClick={() => setLimit((l) => l + 200)}
            className="w-full py-2 text-2xs text-editor-comment hover:text-editor-fg hover:bg-editor-line transition-colors"
          >
            Load 200 more…
          </button>
        )}
      </div>

      {/* Commit detail panel — shown when a commit is selected */}
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
