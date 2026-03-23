import { X } from "lucide-react";

const SECTIONS = [
  {
    title: "Navigation",
    items: [
      { key: "⌘P",    desc: "Go to file (fuzzy finder)" },
      { key: "⌘⇧P",   desc: "Command palette" },
      { key: "⌘B",    desc: "Toggle file explorer" },
      { key: "⌘J",    desc: "Toggle terminal panel" },
      { key: "⌘G",    desc: "Toggle git panel" },
      { key: "⌘⇧O",   desc: "Open folder" },
      { key: "⌘⇧N",   desc: "New window" },
      { key: "⌘\\",   desc: "Cycle saved preset" },
    ],
  },
  {
    title: "Tabs",
    items: [
      { key: "⌘⇧C",   desc: "Open AI agent launcher" },
      { key: "⌘⇧L",   desc: "Open terminal tab" },
      { key: "⌘⇧R",   desc: "Open HTML viewer tab" },
      { key: "⌘⇧/",   desc: "Open PDF viewer tab" },
      { key: "⌘⇧M",   desc: "Toggle Spotify player" },
    ],
  },
  {
    title: "Editing",
    items: [
      { key: "⌘S",    desc: "Save file" },
      { key: "⌘W",    desc: "Close tab" },
      { key: "⌘Z",    desc: "Undo" },
      { key: "⌘⇧Z",   desc: "Redo" },
      { key: "Tab",   desc: "Indent (4 spaces)" },
      { key: "⇧Tab",  desc: "Dedent" },
      { key: "⌘+",    desc: "Increase font size" },
      { key: "⌘-",    desc: "Decrease font size" },
    ],
  },
  {
    title: "Vim (Normal Mode)",
    items: [
      { key: "h j k l",     desc: "Move cursor" },
      { key: "[n]j / [n]k", desc: "Move n lines down/up" },
      { key: "i / I",       desc: "Insert before / line start" },
      { key: "a / A",       desc: "Append after / line end" },
      { key: "o / O",       desc: "New line below / above" },
      { key: "Esc",         desc: "Back to normal mode" },
      { key: "d d",         desc: "Delete line" },
      { key: "y y",         desc: "Yank line" },
      { key: "p",           desc: "Paste" },
      { key: "/",           desc: "Search" },
      { key: "g g / G",     desc: "Go to top / bottom" },
    ],
  },
  {
    title: "Terminal",
    items: [
      { key: "+",        desc: "New terminal session" },
      { key: "Drag top", desc: "Resize terminal height" },
    ],
  },
  {
    title: "Markdown",
    items: [
      { key: "Preview btn", desc: "Opens independent Preview tab" },
      { key: "☀ / ☾ toggle", desc: "Switch GitHub Light / Dark in preview" },
    ],
  },
];

interface Props {
  onClose: () => void;
}

export function HelpPanel({ onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Floating panel — top-right */}
      <div className="fixed top-10 right-3 z-50 w-80 max-h-[80vh] flex flex-col
                      border border-editor-border rounded-lg shadow-2xl
                      overflow-hidden fade-in"
           style={{ background: "rgb(var(--c-sidebar) / 0.92)", backdropFilter: "blur(24px) saturate(1.6)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-editor-border shrink-0">
          <span className="text-xs font-semibold text-editor-fg tracking-wide">Keyboard Shortcuts</span>
          <button onClick={onClose} className="text-editor-comment hover:text-editor-fg transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Scrollable shortcut list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-2xs font-semibold tracking-widest uppercase text-editor-comment mb-2">
                {section.title}
              </p>
              <div className="space-y-1.5">
                {section.items.map(({ key, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <kbd className="kbd shrink-0 text-editor-blue">{key}</kbd>
                    <span className="text-2xs text-editor-comment text-right">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
