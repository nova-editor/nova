import { useMemo, useCallback } from "react";
import { marked } from "marked";
import { open } from "@tauri-apps/plugin-shell";

// Configure marked for GFM + safe rendering
marked.setOptions({ gfm: true, breaks: true });

interface Props {
  content: string;
}

export function MarkdownPreview({ content }: Props) {
  const html = useMemo(() => marked.parse(content) as string, [content]);

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
    <div className="flex-1 h-full overflow-y-auto border-l border-editor-border" style={{ background: "#ffffff" }}>
      <div
        className="md-preview"
        style={{ padding: "32px 40px", maxWidth: 900 }}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleLinkClick}
      />
    </div>
  );
}
