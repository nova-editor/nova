import { GitBranch, Circle } from "lucide-react";
import { useStore } from "../store";

export function StatusBar() {
  const tabs      = useStore((s) => s.tabs);
  const activeIdx = useStore((s) => s.activeTabIdx);
  const branch    = useStore((s) => s.gitBranch);
  const vimMode   = useStore((s) => s.vimMode);

  const tab = tabs[activeIdx];

  return (
    <div className="flex items-center justify-between px-3 text-2xs font-mono border-t border-editor-border text-editor-comment shrink-0"
         style={{ height: 24, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))" }}>
      {/* Left */}
      <div className="flex items-center gap-3">
        {branch && (
          <span className="flex items-center gap-1 text-editor-blue">
            <GitBranch size={11} />
            {branch}
          </span>
        )}
        {tab?.dirty && (
          <span className="flex items-center gap-1 text-editor-yellow">
            <Circle size={7} fill="currentColor" />
            unsaved
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {tab && (
          <span className={`px-1.5 py-0.5 rounded text-2xs font-bold tracking-widest uppercase ${
            vimMode === "normal"
              ? "bg-editor-blue/20 text-editor-blue"
              : "bg-editor-green/20 text-editor-green"
          }`}>
            {vimMode}
          </span>
        )}

        {tab && (
          <>
            <span>{tab.language}</span>
            <span>UTF-8</span>
          </>
        )}
        <span className="text-editor-fg/40">nova v0.1</span>
      </div>
    </div>
  );
}
