/**
 * nova Git Panel — enhanced with:
 *  • Inline per-file diff viewer (click any file to expand its diff)
 *  • Stage-all / Unstage-all one-click buttons
 *  • Amend mode — pre-fills last commit message, amends instead of committing
 *  • Stash tab — full stash list with push / pop / drop
 *  • Working branch delete (previously stubbed)
 *  • Ahead/behind tracking on branches with upstreams
 *  • Commit detail expansion — click any commit to see affected files
 */

import { useState, useEffect, useCallback } from "react";
import {
  GitBranch, Plus, Minus, Check, GitCommit as CommitIcon,
  RefreshCw, GitMerge, Trash2, RotateCcw, ChevronDown,
  ChevronRight, ChevronsUp, ChevronsDown, Layers, ArrowUp,
  ArrowDown, FileText, AlertCircle, GitGraph as GraphIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { GitGraph } from "./GitGraph";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "changes" | "stash" | "log" | "branches" | "graph";

interface GitCommit {
  oid:     string;
  message: string;
  author:  string;
  time:    number;
}

interface GitDiffLine {
  old_lineno: number | null;
  new_lineno: number | null;
  kind:    string; // "Added" | "Deleted" | "Context"
  content: string;
}

interface GitDiffHunk {
  old_start: number;
  new_start: number;
  lines:     GitDiffLine[];
}

interface GitStash {
  index:   number;
  message: string;
  branch:  string;
}

interface AheadBehind {
  ahead:  number;
  behind: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)          return `${diff}s ago`;
  if (diff < 3600)        return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30)  return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function kindColor(kind: string) {
  if (kind.includes("Modified"))                          return "text-editor-yellow";
  if (kind.includes("Added") || kind.includes("Untracked")) return "text-editor-green";
  if (kind.includes("Deleted"))                           return "text-editor-red";
  return "text-editor-comment";
}

function kindGlyph(kind: string, staged: boolean) {
  if (!staged && kind.includes("Untracked")) return "U";
  if (kind.includes("Added"))    return "A";
  if (kind.includes("Modified")) return "M";
  if (kind.includes("Deleted"))  return "D";
  return "?";
}

// ── Inline diff viewer ────────────────────────────────────────────────────────
function FileDiffView({ repoPath, filePath }: { repoPath: string; filePath: string }) {
  const [hunks, setHunks] = useState<GitDiffHunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    invoke<GitDiffHunk[]>("git_diff", { repoPath, filePath })
      .then(setHunks)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, filePath]);

  if (loading) return (
    <div className="px-4 py-2 text-2xs text-editor-comment font-mono">Loading diff…</div>
  );
  if (err) return (
    <div className="px-4 py-2 text-2xs text-editor-red font-mono">{err}</div>
  );
  if (hunks.length === 0) return (
    <div className="px-4 py-2 text-2xs text-editor-comment font-mono italic">No diff available (file may be untracked or binary)</div>
  );

  return (
    <div className="border-t border-editor-border/30 overflow-x-auto" style={{ background: "rgb(var(--c-deep))" }}>
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          {/* Hunk header */}
          <div className="px-3 py-0.5 text-2xs text-editor-comment font-mono border-b border-editor-border/20"
               style={{ background: "rgb(var(--c-sidebar))" }}>
            @@ -{hunk.old_start} +{hunk.new_start} @@
          </div>
          {hunk.lines.map((line, li) => {
            const isAdd = line.kind === "Added";
            const isDel = line.kind === "Deleted";
            return (
              <div
                key={li}
                className="flex text-2xs font-mono leading-[1.6]"
                style={{
                  background: isAdd ? "rgba(var(--c-green),0.08)" : isDel ? "rgba(var(--c-red),0.08)" : "transparent",
                }}
              >
                {/* Line numbers */}
                <span className="w-7 shrink-0 text-right pr-1 text-editor-comment/40 select-none border-r border-editor-border/20">
                  {line.old_lineno ?? ""}
                </span>
                <span className="w-7 shrink-0 text-right pr-1 text-editor-comment/40 select-none border-r border-editor-border/20">
                  {line.new_lineno ?? ""}
                </span>
                {/* Sign */}
                <span className={`w-4 shrink-0 text-center select-none ${isAdd ? "text-editor-green" : isDel ? "text-editor-red" : "text-editor-comment/30"}`}>
                  {isAdd ? "+" : isDel ? "−" : " "}
                </span>
                {/* Content */}
                <span className={`flex-1 pl-1 whitespace-pre ${isAdd ? "text-editor-green" : isDel ? "text-editor-red" : "text-editor-fg"}`}>
                  {line.content}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Changes tab ───────────────────────────────────────────────────────────────
function ChangesTab() {
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const gitStatus     = useStore((s) => s.gitStatus);
  const stageFile     = useStore((s) => s.stageFile);
  const unstageFile   = useStore((s) => s.unstageFile);
  const discardFile   = useStore((s) => s.discardFile);
  const commitFiles   = useStore((s) => s.commitFiles);
  const refreshGit    = useStore((s) => s.refreshGit);
  const setStatus     = useStore((s) => s.setStatus);

  const [commitMsg,  setCommitMsg]  = useState("");
  const [amend,      setAmend]      = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  const staged   = gitStatus.filter((s) => s.staged);
  const unstaged = gitStatus.filter((s) => !s.staged);

  // Pre-fill last commit message when amend mode is turned on
  useEffect(() => {
    if (!amend || !workspaceRoot) return;
    invoke<string>("git_last_commit_message", { repoPath: workspaceRoot })
      .then((msg) => setCommitMsg(msg))
      .catch(() => {});
  }, [amend, workspaceRoot]);

  const toggleFileExpand = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const stageAll = async () => {
    try {
      await invoke("git_stage_all", { repoPath: workspaceRoot });
      await refreshGit();
    } catch (e) { setStatus(`Stage all failed: ${e}`); }
  };

  const unstageAll = async () => {
    try {
      await invoke("git_unstage_all", { repoPath: workspaceRoot });
      await refreshGit();
    } catch (e) { setStatus(`Unstage all failed: ${e}`); }
  };

  const doCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      if (amend) {
        await invoke("git_commit_amend", { repoPath: workspaceRoot, message: commitMsg.trim() });
        setStatus("Amended last commit");
      } else {
        await commitFiles(commitMsg.trim());
      }
      setCommitMsg("");
      setAmend(false);
    } catch (e) { setStatus(`Commit failed: ${e}`); }
    setCommitting(false);
  };

  const canCommit = commitMsg.trim().length > 0 && (amend || staged.length > 0) && !committing;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* ── Staged section ─────────────────────────────────────────────── */}
        {staged.length > 0 && (
          <div>
            <div className="flex items-center px-3 py-1.5 border-b border-editor-border/30">
              <span className="text-2xs font-sans font-semibold tracking-widest uppercase text-editor-comment flex-1">
                Staged ({staged.length})
              </span>
              <button
                onClick={unstageAll}
                title="Unstage all"
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs text-editor-comment hover:text-editor-fg hover:bg-white/5 transition-colors"
              >
                <ChevronsDown size={10} /> All
              </button>
            </div>
            {staged.map((f) => (
              <div key={`s-${f.path}`}>
                <div
                  className="flex items-center gap-2 px-3 py-1 hover:bg-editor-line group transition-colors cursor-pointer"
                  onClick={() => toggleFileExpand(`s-${f.path}`)}
                >
                  {expandedFiles.has(`s-${f.path}`)
                    ? <ChevronDown size={9} className="text-editor-comment shrink-0" />
                    : <ChevronRight size={9} className="text-editor-comment shrink-0" />}
                  <span className={`w-4 text-center font-bold text-xs shrink-0 ${kindColor(f.kind)}`}>
                    {kindGlyph(f.kind, true)}
                  </span>
                  <span className="flex-1 truncate text-editor-fg text-xs">{f.path.split("/").pop()}</span>
                  <span className="text-editor-comment/40 text-2xs truncate max-w-[60px] hidden group-hover:block mr-1">
                    {f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : ""}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-editor-comment hover:text-editor-red transition-all"
                    onClick={(e) => { e.stopPropagation(); unstageFile(f.path); }}
                    title="Unstage"
                  >
                    <Minus size={11} />
                  </button>
                </div>
                {expandedFiles.has(`s-${f.path}`) && (
                  <FileDiffView repoPath={workspaceRoot} filePath={f.path} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Unstaged section ───────────────────────────────────────────── */}
        {unstaged.length > 0 && (
          <div>
            <div className="flex items-center px-3 py-1.5 border-b border-editor-border/30">
              <span className="text-2xs font-sans font-semibold tracking-widest uppercase text-editor-comment flex-1">
                Changes ({unstaged.length})
              </span>
              <button
                onClick={stageAll}
                title="Stage all"
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs text-editor-comment hover:text-editor-fg hover:bg-white/5 transition-colors"
              >
                <ChevronsUp size={10} /> All
              </button>
            </div>
            {unstaged.map((f) => (
              <div key={`u-${f.path}`}>
                <div
                  className="flex items-center gap-2 px-3 py-1 hover:bg-editor-line group transition-colors cursor-pointer"
                  onClick={() => toggleFileExpand(`u-${f.path}`)}
                >
                  {expandedFiles.has(`u-${f.path}`)
                    ? <ChevronDown size={9} className="text-editor-comment shrink-0" />
                    : <ChevronRight size={9} className="text-editor-comment shrink-0" />}
                  <span className={`w-4 text-center font-bold text-xs shrink-0 ${kindColor(f.kind)}`}>
                    {kindGlyph(f.kind, false)}
                  </span>
                  <span className="flex-1 truncate text-editor-comment text-xs">{f.path.split("/").pop()}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      className="text-editor-comment hover:text-editor-red transition-colors"
                      onClick={(e) => { e.stopPropagation(); discardFile(f.path); }}
                      title="Discard changes"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      className="text-editor-comment hover:text-editor-green transition-colors"
                      onClick={(e) => { e.stopPropagation(); stageFile(f.path); }}
                      title="Stage"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
                {expandedFiles.has(`u-${f.path}`) && (
                  <FileDiffView repoPath={workspaceRoot} filePath={f.path} />
                )}
              </div>
            ))}
          </div>
        )}

        {gitStatus.length === 0 && (
          <div className="px-3 py-8 text-editor-comment text-center text-xs">
            <Check size={20} className="mx-auto mb-2 opacity-30" />
            Working tree clean
          </div>
        )}
      </div>

      {/* ── Commit box ─────────────────────────────────────────────────────── */}
      <div className="border-t border-editor-border p-2 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Amend the last commit instead of creating a new one">
            <input
              type="checkbox"
              checked={amend}
              onChange={(e) => setAmend(e.target.checked)}
              className="w-3 h-3 accent-editor-blue"
            />
            <span className="text-2xs text-editor-comment font-sans">Amend last commit</span>
          </label>
          <button onClick={refreshGit} title="Refresh" className="text-editor-comment hover:text-editor-fg transition-colors">
            <RefreshCw size={11} />
          </button>
        </div>
        <textarea
          className="w-full bg-editor-line text-editor-fg text-xs rounded p-2 resize-none border border-editor-border focus:outline-none focus:border-editor-accent placeholder-editor-comment font-mono"
          rows={2}
          placeholder={amend ? "Amend message…" : "Commit message…"}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) doCommit();
          }}
        />
        <button
          onClick={doCommit}
          disabled={!canCommit}
          className="mt-1.5 w-full py-1 rounded text-2xs font-sans font-semibold bg-editor-accent text-white
                     hover:bg-editor-accent/80 disabled:cursor-not-allowed transition-colors"
        >
          {committing
            ? "Committing…"
            : amend
              ? "Amend Commit"
              : `Commit${staged.length > 0 ? ` (${staged.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}

// ── Stash tab ─────────────────────────────────────────────────────────────────
function StashTab() {
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const setStatus     = useStore((s) => s.setStatus);
  const refreshGit    = useStore((s) => s.refreshGit);

  const [stashes,    setStashes]    = useState<GitStash[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [stashMsg,   setStashMsg]   = useState("");
  const [showInput,  setShowInput]  = useState(false);
  const [working,    setWorking]    = useState<number | null>(null); // index being popped/dropped

  const load = useCallback(() => {
    if (!workspaceRoot) return;
    setLoading(true);
    invoke<GitStash[]>("git_stash_list", { repoPath: workspaceRoot })
      .then(setStashes)
      .catch(() => setStashes([]))
      .finally(() => setLoading(false));
  }, [workspaceRoot]);

  useEffect(() => { load(); }, [load]);

  const doStash = async () => {
    try {
      await invoke("git_stash_push", { repoPath: workspaceRoot, message: stashMsg.trim() || null });
      setStashMsg(""); setShowInput(false);
      setStatus("Changes stashed");
      await refreshGit();
      load();
    } catch (e) { setStatus(`Stash failed: ${e}`); }
  };

  const doPop = async (index: number) => {
    setWorking(index);
    try {
      await invoke("git_stash_pop", { repoPath: workspaceRoot, index });
      setStatus(`Popped stash@{${index}}`);
      await refreshGit();
      load();
    } catch (e) { setStatus(`Pop failed: ${e}`); }
    setWorking(null);
  };

  const doDrop = async (index: number) => {
    setWorking(index);
    try {
      await invoke("git_stash_drop", { repoPath: workspaceRoot, index });
      setStatus(`Dropped stash@{${index}}`);
      load();
    } catch (e) { setStatus(`Drop failed: ${e}`); }
    setWorking(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 text-editor-comment text-center text-xs">Loading…</div>
        ) : stashes.length === 0 ? (
          <div className="px-3 py-8 text-editor-comment text-center text-xs">
            <Layers size={20} className="mx-auto mb-2 opacity-30" />
            No stashes
          </div>
        ) : (
          stashes.map((s) => (
            <div
              key={s.index}
              className="flex items-start gap-2 px-3 py-2 border-b border-editor-border/30 hover:bg-editor-line group transition-colors"
            >
              <Layers size={11} className="text-editor-blue shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-editor-fg truncate">{s.message}</div>
                {s.branch && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <GitBranch size={9} className="text-editor-comment" />
                    <span className="text-2xs text-editor-comment">{s.branch}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => doPop(s.index)}
                  disabled={working === s.index}
                  title="Pop (apply + drop)"
                  className="text-2xs px-1.5 py-0.5 rounded text-editor-green hover:bg-editor-green/10 transition-colors disabled:opacity-40"
                >
                  {working === s.index ? "…" : "Pop"}
                </button>
                <button
                  onClick={() => doDrop(s.index)}
                  disabled={working === s.index}
                  title="Drop (discard)"
                  className="text-editor-comment hover:text-editor-red transition-colors disabled:opacity-40"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stash push control */}
      <div className="border-t border-editor-border p-2 shrink-0">
        {showInput ? (
          <div className="space-y-1.5">
            <input
              autoFocus
              value={stashMsg}
              onChange={(e) => setStashMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doStash(); if (e.key === "Escape") setShowInput(false); }}
              placeholder="Stash message (optional)"
              className="w-full bg-editor-line text-editor-fg text-xs rounded p-1.5 border border-editor-border focus:outline-none focus:border-editor-accent placeholder-editor-comment font-mono"
            />
            <div className="flex gap-1">
              <button
                onClick={doStash}
                className="flex-1 py-1 rounded text-2xs font-sans font-semibold bg-editor-accent text-white hover:bg-editor-accent/80 transition-colors"
              >
                Stash Changes
              </button>
              <button
                onClick={() => setShowInput(false)}
                className="px-2 py-1 rounded text-2xs text-editor-comment hover:text-editor-fg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1 rounded text-2xs font-sans
                       text-editor-fg hover:bg-white/5 transition-colors border border-editor-border"
          >
            <Layers size={11} />
            Stash Changes
          </button>
        )}
      </div>
    </div>
  );
}

// ── Log tab ───────────────────────────────────────────────────────────────────
function LogTab() {
  const workspaceRoot = useStore((s) => s.workspaceRoot);

  const [commits,      setCommits]      = useState<GitCommit[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [expandedOid,  setExpandedOid]  = useState<string | null>(null);
  const [commitFiles,  setCommitFiles]  = useState<Record<string, string[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) return;
    setLoading(true);
    invoke<GitCommit[]>("git_log", { repoPath: workspaceRoot, limit: 100 })
      .then(setCommits)
      .catch(() => setCommits([]))
      .finally(() => setLoading(false));
  }, [workspaceRoot]);

  const toggleCommit = async (oid: string) => {
    if (expandedOid === oid) { setExpandedOid(null); return; }
    setExpandedOid(oid);
    if (commitFiles[oid]) return; // already loaded
    setLoadingFiles(oid);
    try {
      const files = await invoke<string[]>("git_commit_files", { repoPath: workspaceRoot, oid });
      setCommitFiles((p) => ({ ...p, [oid]: files }));
    } catch { setCommitFiles((p) => ({ ...p, [oid]: ["(error loading files)"] })); }
    setLoadingFiles(null);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-editor-comment text-xs">Loading…</div>;
  if (commits.length === 0) return <div className="flex-1 flex items-center justify-center text-editor-comment text-xs">No commits yet</div>;

  return (
    <div className="flex-1 overflow-y-auto">
      {commits.map((c) => (
        <div key={c.oid} className="border-b border-editor-border/30">
          {/* Commit row — click to expand */}
          <div
            className="flex items-start gap-2.5 px-3 py-2 hover:bg-editor-line transition-colors group cursor-pointer"
            onClick={() => toggleCommit(c.oid)}
          >
            {expandedOid === c.oid
              ? <ChevronDown size={10} className="text-editor-blue shrink-0 mt-1" />
              : <ChevronRight size={10} className="text-editor-comment shrink-0 mt-1" />}
            <CommitIcon size={11} className="text-editor-blue shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-editor-fg truncate">{c.message}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-2xs text-editor-blue font-mono">{c.oid}</span>
                <span className="text-2xs text-editor-comment truncate">{c.author}</span>
                <span className="text-2xs text-editor-comment ml-auto shrink-0">{relTime(c.time)}</span>
              </div>
            </div>
          </div>

          {/* Expanded file list */}
          {expandedOid === c.oid && (
            <div className="pb-1 border-t border-editor-border/20" style={{ background: "rgb(var(--c-deep))" }}>
              {loadingFiles === c.oid ? (
                <div className="px-8 py-1.5 text-2xs text-editor-comment">Loading files…</div>
              ) : (commitFiles[c.oid] ?? []).map((entry, i) => {
                // entry format from git diff-tree --name-status: "M\tpath" or "A\tpath"
                const parts = entry.split("\t");
                const status = parts[0] ?? "";
                const path   = parts[1] ?? entry;
                const color  = status === "A" ? "text-editor-green" : status === "D" ? "text-editor-red" : "text-editor-yellow";
                return (
                  <div key={i} className="flex items-center gap-2 px-8 py-0.5">
                    <span className={`text-2xs font-mono font-bold w-3 shrink-0 ${color}`}>{status}</span>
                    <FileText size={9} className="text-editor-comment shrink-0" />
                    <span className="text-2xs text-editor-fg font-mono truncate">{path}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Branches tab ──────────────────────────────────────────────────────────────
function BranchesTab() {
  const gitBranches    = useStore((s) => s.gitBranches);
  const gitBranch      = useStore((s) => s.gitBranch);
  const checkoutBranch = useStore((s) => s.checkoutBranch);
  const refreshGit     = useStore((s) => s.refreshGit);
  const workspaceRoot  = useStore((s) => s.workspaceRoot);
  const setStatus      = useStore((s) => s.setStatus);

  const [newBranch,   setNewBranch]   = useState("");
  const [creating,    setCreating]    = useState(false);
  const [aheadBehind, setAheadBehind] = useState<Record<string, AheadBehind>>({});
  const [deleting,    setDeleting]    = useState<string | null>(null);

  // Fetch ahead/behind for all branches with upstreams
  useEffect(() => {
    const branches = gitBranches.filter((b) => b.upstream);
    if (!workspaceRoot || branches.length === 0) return;
    branches.forEach((b) => {
      invoke<AheadBehind>("git_ahead_behind", { repoPath: workspaceRoot, branch: b.name })
        .then((ab) => {
          if (ab.ahead > 0 || ab.behind > 0) {
            setAheadBehind((p) => ({ ...p, [b.name]: ab }));
          }
        })
        .catch(() => {});
    });
  }, [gitBranches, workspaceRoot]);

  const doCreate = async () => {
    const name = newBranch.trim();
    if (!name) { setCreating(false); return; }
    try {
      await invoke("git_create_branch", { repoPath: workspaceRoot, branch: name });
      setStatus(`Switched to new branch "${name}"`);
      refreshGit();
    } catch (e) { setStatus(`Branch failed: ${e}`); }
    setNewBranch(""); setCreating(false);
  };

  const doDelete = async (name: string) => {
    if (deleting) return;
    setDeleting(name);
    try {
      await invoke("git_delete_branch", { repoPath: workspaceRoot, branch: name });
      setStatus(`Deleted branch "${name}"`);
      refreshGit();
    } catch (e) { setStatus(`Delete failed: ${e}`); }
    setDeleting(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {gitBranches.map((b) => {
          const ab = aheadBehind[b.name];
          return (
            <div
              key={b.name}
              className={`flex items-center gap-2 px-3 py-2 border-b border-editor-border/30 group transition-colors
                ${b.is_current ? "bg-editor-blue/5" : "hover:bg-editor-line"}`}
            >
              <GitBranch size={12} className={b.is_current ? "text-editor-blue" : "text-editor-comment"} />
              <span className={`flex-1 text-xs truncate ${b.is_current ? "text-editor-blue font-semibold" : "text-editor-fg"}`}>
                {b.name}
              </span>

              {/* Ahead/behind badges */}
              {ab && ab.behind > 0 && (
                <span className="flex items-center gap-0.5 text-2xs text-editor-yellow" title={`${ab.behind} behind upstream`}>
                  <ArrowDown size={9} />{ab.behind}
                </span>
              )}
              {ab && ab.ahead > 0 && (
                <span className="flex items-center gap-0.5 text-2xs text-editor-green" title={`${ab.ahead} ahead of upstream`}>
                  <ArrowUp size={9} />{ab.ahead}
                </span>
              )}

              {b.is_current && <Check size={11} className="text-editor-blue shrink-0" />}

              {!b.is_current && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => checkoutBranch(b.name)}
                    title="Checkout"
                    className="text-editor-comment hover:text-editor-green transition-colors"
                  >
                    <GitMerge size={11} />
                  </button>
                  <button
                    onClick={() => doDelete(b.name)}
                    disabled={deleting === b.name}
                    title="Delete branch"
                    className="text-editor-comment hover:text-editor-red transition-colors disabled:opacity-40"
                  >
                    {deleting === b.name ? <AlertCircle size={11} /> : <Trash2 size={11} />}
                  </button>
                </div>
              )}

              {b.upstream && (
                <span className="text-2xs text-editor-comment/50 hidden group-hover:inline truncate max-w-[60px] ml-0.5">
                  ↑{b.upstream.split("/").pop()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* New branch */}
      <div className="border-t border-editor-border p-2 shrink-0">
        {creating ? (
          <div className="flex items-center gap-1.5">
            <GitBranch size={12} className="text-editor-blue shrink-0" />
            <input
              autoFocus
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") setCreating(false); }}
              onBlur={() => { if (!newBranch.trim()) setCreating(false); }}
              placeholder="branch-name"
              className="flex-1 bg-transparent text-xs font-mono text-editor-fg outline-none border-b border-editor-blue/60 placeholder-editor-comment/50"
            />
            <button onClick={doCreate} className="text-2xs text-editor-blue hover:text-editor-fg transition-colors">create</button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1 rounded text-2xs font-sans
                       text-editor-comment hover:text-editor-fg hover:bg-white/5 transition-colors border border-editor-border"
          >
            <Plus size={11} />
            New branch from {gitBranch || "HEAD"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── GitPanel ──────────────────────────────────────────────────────────────────
export function GitPanel() {
  const gitBranch      = useStore((s) => s.gitBranch);
  const gitStatus      = useStore((s) => s.gitStatus);
  const refreshGit     = useStore((s) => s.refreshGit);
  const setGitPanelWidth = useStore((s) => s.setGitPanelWidth);
  const [tab, setTab] = useState<Tab>("changes");

  // Keep store in sync so Spotify tile always gaps from the real panel width
  useEffect(() => {
    setGitPanelWidth(tab === "graph" ? 360 : 280);
  }, [tab, setGitPanelWidth]);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "changes",  label: "Changes",  badge: gitStatus.length > 0 ? gitStatus.length : undefined },
    { id: "stash",    label: "Stash"                },
    { id: "log",      label: "Log"                  },
    { id: "branches", label: "Branches"             },
    { id: "graph",    label: "Graph"                },
  ];

  return (
    <div
      className="flex flex-col border-l border-editor-border overflow-hidden text-xs font-mono"
      style={{ width: tab === "graph" ? 360 : 280, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))", transition: "width 150ms ease" }}
    >
      {/* Branch header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-editor-border shrink-0">
        <GitBranch size={12} className="text-editor-blue shrink-0" />
        <span className="text-editor-blue font-semibold truncate flex-1">{gitBranch || "no branch"}</span>
        <button onClick={refreshGit} title="Refresh" className="text-editor-comment hover:text-editor-fg transition-colors">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-editor-border shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-2xs font-sans font-semibold transition-colors relative
              ${tab === t.id
                ? "text-editor-blue border-b-2 border-editor-blue -mb-px"
                : "text-editor-comment hover:text-editor-fg"}`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold bg-editor-accent text-white leading-none">
                {t.badge > 99 ? "99" : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "changes"  && <ChangesTab />}
      {tab === "stash"    && <StashTab />}
      {tab === "log"      && <LogTab />}
      {tab === "branches" && <BranchesTab />}
      {tab === "graph"    && <GitGraph />}
    </div>
  );
}
