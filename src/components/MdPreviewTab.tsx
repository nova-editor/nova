import { useMemo, useState, useCallback } from "react";
import { marked } from "marked";
import { Sun, Moon, FileText } from "lucide-react";
import { useStore, FileTab, MD_PREVIEW_PREFIX } from "../store";
import { open } from "@tauri-apps/plugin-shell";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  tab:     FileTab;
  visible: boolean;
}

export function MdPreviewTab({ tab, visible }: Props) {
  const sourcePath = tab.path.slice(MD_PREVIEW_PREFIX.length);
  const content    = useStore((s) => s.mdPreviewContents[sourcePath] ?? "");
  const [dark, setDark] = useState(false);

  const html = useMemo(() => marked.parse(content) as string, [content]);

  const bg      = dark ? "#0d1117" : "#ffffff";
  const barBg   = dark ? "rgba(22,27,34,0.85)"  : "rgba(246,248,250,0.85)";
  const barBdr  = dark ? "rgba(48,54,61,0.6)"   : "rgba(208,215,222,0.6)";
  const barFg   = dark ? "#8b949e" : "#57606a";
  const iconFg  = dark ? "#e6edf3" : "#1f2328";

  const fileName = sourcePath.split("/").pop() ?? sourcePath;

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (href.startsWith("http://") || href.startsWith("https://")) {
      e.preventDefault();
      open(href);
    }
  }, []);

  return (
    <div
      style={{
        display:       visible ? "flex" : "none",
        flexDirection: "column",
        flex:          1,
        minHeight:     0,
        overflow:      "hidden",
        background:    bg,
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display:              "flex",
          alignItems:           "center",
          gap:                  8,
          padding:              "0 12px",
          height:               36,
          borderBottom:         `1px solid ${barBdr}`,
          background:           barBg,
          backdropFilter:       "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          flexShrink:           0,
          fontFamily:           "'JetBrains Mono', monospace",
          fontSize:             11,
          color:                barFg,
        }}
      >
        <FileText size={13} style={{ color: dark ? "#58a6ff" : "#0969da", flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileName} — Preview
        </span>

        {/* Dark / Light toggle */}
        <button
          onClick={() => setDark((v) => !v)}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          26,
            height:         26,
            borderRadius:   4,
            border:         "none",
            background:     "transparent",
            color:          barFg,
            cursor:         "pointer",
            transition:     "background 0.1s, color 0.1s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color      = iconFg;
            (e.currentTarget as HTMLElement).style.background = dark ? "rgba(48,54,61,0.6)" : "rgba(208,215,222,0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color      = barFg;
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", background: bg }}>
        <div
          className={`md-preview${dark ? " dark" : ""}`}
          style={{ padding: "32px 40px", maxWidth: 960 }}
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={handleLinkClick}
        />
      </div>
    </div>
  );
}
