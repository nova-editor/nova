import { useMemo } from "react";
import { marked } from "marked";

// Configure marked for GFM + safe rendering
marked.setOptions({ gfm: true, breaks: true });

interface Props {
  content: string;
}

export function MarkdownPreview({ content }: Props) {
  const html = useMemo(() => marked.parse(content) as string, [content]);

  return (
    <div className="flex-1 h-full overflow-y-auto border-l border-editor-border" style={{ background: "rgb(var(--c-deep))" }}>
      <div
        className="md-preview px-8 py-6 text-sm font-sans"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
