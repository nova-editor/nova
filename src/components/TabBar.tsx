import { X } from "lucide-react";
import { FileTab } from "../store";

const AI_PROVIDER_COLORS: Record<string, string> = {
  claude: "#cc785c",
  gemini: "#1a73e8",
  codex:  "#10a37f",
};

interface TabBarProps {
  tabs:        FileTab[];
  activeIdx:   number;
  onSetActive: (idx: number) => void;
  onClose:     (idx: number) => void;
}

export function TabBar({ tabs, activeIdx, onSetActive, onClose }: TabBarProps) {
  if (tabs.length === 0) return (
    <div
      className="flex items-end shrink-0 overflow-x-auto flex-1"
      style={{ height: 30, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))", scrollbarWidth: "none" }}
    >
      <div className="flex-1" style={{ borderBottom: "1px solid rgb(var(--c-selection))", height: "100%" }} />
    </div>
  );

  return (
    <div
      className="flex items-end shrink-0 overflow-x-auto flex-1"
      style={{ height: 30, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))", scrollbarWidth: "none" }}
    >
      {tabs.map((tab, i) => {
        const active = i === activeIdx;
        return (
          <div
            key={`${tab.path}-${i}`}
            onClick={() => onSetActive(i)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(i); } }}
            className="group/tab relative flex items-center gap-1.5 cursor-pointer select-none shrink-0 transition-colors"
            style={{
              height:       active ? 28 : 25,
              padding:      "0 10px 0 12px",
              background:   active ? "rgb(var(--c-bg) / var(--surface-alpha, 1))" : "transparent",
              color:        active ? "rgb(var(--c-fg))" : "rgb(var(--c-gutter))",
              fontSize:     12,
              fontFamily:   "'JetBrains Mono', monospace",
              borderLeft:   active ? "1px solid rgb(var(--c-selection))" : "1px solid transparent",
              borderRight:  active ? "1px solid rgb(var(--c-selection))" : "1px solid transparent",
              borderTop:    active ? "1px solid rgb(var(--c-selection))" : "none",
              borderRadius: active ? "4px 4px 0 0" : 0,
              marginLeft:   i === 0 ? 4 : 0,
              alignSelf:    "flex-end",
            }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-fg))"; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-gutter))"; }}
          >
            {/* Active bottom gap — hides the tab bar bottom border */}
            {active && (
              <span
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 1, background: "rgb(var(--c-bg) / var(--surface-alpha, 1))" }}
              />
            )}

            {tab.kind === "ai" && tab.aiProvider && (
              <span style={{
                width:        6,
                height:       6,
                borderRadius: "50%",
                background:   AI_PROVIDER_COLORS[tab.aiProvider] ?? "rgb(var(--c-accent))",
                display:      "inline-block",
                flexShrink:   0,
                marginRight:  2,
              }} />
            )}
            <span className="truncate" style={{ maxWidth: 130 }}>{tab.name}</span>

            {/* Close / dirty — visible on active tab or on hover */}
            <span
              className={`shrink-0 flex items-center justify-center rounded transition-opacity
                ${active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-50 hover:!opacity-100"}`}
              style={{ width: 16, height: 16, marginLeft: 4 }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color      = "rgb(var(--c-red))";
                el.style.background = "rgba(255,255,255,0.07)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color      = "";
                el.style.background = "";
              }}
              onClick={(e) => { e.stopPropagation(); onClose(i); }}
            >
              {tab.dirty
                ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgb(var(--c-accent))", display: "block" }} />
                : <X size={10} />
              }
            </span>
          </div>
        );
      })}

      {/* Right fill — bottom border continues across empty space */}
      <div className="flex-1" style={{ borderBottom: "1px solid rgb(var(--c-selection))", height: "100%" }} />
    </div>
  );
}
