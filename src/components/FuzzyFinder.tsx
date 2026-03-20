import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search } from "lucide-react";
import { useStore } from "../store";

// Fuzzy match with score: returns null if no match, or a score (higher = better).
// Consecutive matching chars and matches at path separators/word boundaries score higher.
function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, qi = 0, score = 0, consecutive = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      consecutive++;
      // Bonus for consecutive chars, path separators, dots, and uppercase boundaries
      const boundary = ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "." || t[ti - 1] === "_" || t[ti - 1] === "-";
      score += consecutive * 2 + (boundary ? 5 : 0);
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }
  return qi === q.length ? score - ti : null; // penalise longer paths slightly
}

export function FuzzyFinder() {
  const [query,   setQuery]   = useState("");
  const [files,   setFiles]   = useState<string[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [cursor,  setCursor]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const openFile      = useStore((s) => s.openFile);
  const setOpen       = useStore((s) => s.setFuzzyOpen);

  // Single fast walk_dir call — uses the ignore crate (ripgrep's engine) in parallel
  useEffect(() => {
    if (workspaceRoot) {
      invoke<string[]>("walk_dir", { root: workspaceRoot })
        .then(setFiles)
        .catch(() => {});
    }
    inputRef.current?.focus();
  }, [workspaceRoot]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(files.slice(0, 100));
    } else {
      const scored: Array<{ file: string; score: number }> = [];
      for (const file of files) {
        const score = fuzzyScore(file, q);
        if (score !== null) scored.push({ file, score });
      }
      scored.sort((a, b) => b.score - a.score);
      setMatches(scored.slice(0, 100).map((s) => s.file));
    }
    setCursor(0);
  }, [query, files]);

  const confirm = useCallback(() => {
    const rel = matches[cursor];
    if (rel) {
      openFile(`${workspaceRoot}/${rel}`);
      setOpen(false);
    }
  }, [matches, cursor, workspaceRoot, openFile, setOpen]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter")     { confirm(); }
  };

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 fade-in"
         onClick={() => setOpen(false)}>
      <div className="w-[560px] border border-editor-border rounded-xl shadow-2xl overflow-hidden fade-in"
           style={{ background: "rgb(var(--c-sidebar) / 0.92)", backdropFilter: "blur(24px) saturate(1.6)" }}
           onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-editor-border">
          <Search size={15} className="text-editor-comment shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Go to file…"
            className="flex-1 bg-transparent text-editor-fg text-sm font-mono outline-none placeholder-editor-comment"
          />
          <span className="text-2xs text-editor-comment">{matches.length} results</span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {matches.map((file, i) => {
            const parts = file.split("/");
            const name  = parts.pop() ?? file;
            const dir   = parts.join("/");
            return (
              <div
                key={file}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors
                  ${i === cursor ? "bg-editor-accent/20 text-editor-fg" : "text-editor-comment hover:bg-editor-line"}`}
                onClick={confirm}
                onMouseEnter={() => setCursor(i)}
              >
                <span className="text-xs font-mono truncate flex-1 text-editor-fg">{name}</span>
                {dir && <span className="text-2xs text-editor-comment shrink-0">{dir}</span>}
              </div>
            );
          })}
          {matches.length === 0 && (
            <div className="px-4 py-6 text-center text-editor-comment text-sm">No files found</div>
          )}
        </div>
      </div>
    </div>
  );
}
