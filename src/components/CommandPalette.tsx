import { useState, useEffect, useRef } from "react";
import { Terminal, GitBranch, FolderOpen, Save, X, Search, FilePlus, FolderPlus } from "lucide-react";
import { useStore } from "../store";

interface Command {
  id:          string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  action:      () => void;
}

export function CommandPalette() {
  const [query,   setQuery]   = useState("");
  const [cursor,  setCursor]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const setOpen        = useStore((s) => s.setPaletteOpen);
  const setFuzzyOpen   = useStore((s) => s.setFuzzyOpen);
  const toggleFileTree = useStore((s) => s.toggleFileTree);
  const toggleTerminal = useStore((s) => s.toggleTerminal);
  const toggleGitPanel = useStore((s) => s.toggleGitPanel);
  const saveTab        = useStore((s) => s.saveTab);
  const showFileTree   = useStore((s) => s.showFileTree);

  const commands: Command[] = [
    {
      id: "open_file", label: "Go to File",
      description: "Fuzzy search all files in the workspace",
      icon: <Search size={14} />,
      action: () => { setOpen(false); setFuzzyOpen(true); },
    },
    {
      id: "save", label: "Save File",
      description: "Save the current editor file",
      icon: <Save size={14} />,
      action: () => {
        const s   = useStore.getState();
        const key = s.focusedPane === "right" && s.rightPane ? "right" : "left";
        const p   = key === "right" ? s.rightPane! : s.leftPane;
        const tab = p.tabs[p.activeIdx];
        if (tab) saveTab(tab.path);
        setOpen(false);
      },
    },
    {
      id: "toggle_tree", label: "Toggle File Explorer",
      description: "Show or hide the file tree panel",
      icon: <FolderOpen size={14} />,
      action: () => { toggleFileTree(); setOpen(false); },
    },
    {
      id: "toggle_terminal", label: "Toggle Terminal",
      description: "Show or hide the embedded terminal",
      icon: <Terminal size={14} />,
      action: () => { toggleTerminal(); setOpen(false); },
    },
    {
      id: "toggle_git", label: "Toggle Git Panel",
      description: "Show or hide the source control panel",
      icon: <GitBranch size={14} />,
      action: () => { toggleGitPanel(); setOpen(false); },
    },
    {
      id: "new_file", label: "New File",
      description: "Create a new file in the workspace root",
      icon: <FilePlus size={14} />,
      action: () => {
        if (!showFileTree) toggleFileTree();
        setOpen(false);
        setTimeout(() => window.dispatchEvent(new CustomEvent("nova:new-file")), 80);
      },
    },
    {
      id: "new_folder", label: "New Folder",
      description: "Create a new folder in the workspace root",
      icon: <FolderPlus size={14} />,
      action: () => {
        if (!showFileTree) toggleFileTree();
        setOpen(false);
        setTimeout(() => window.dispatchEvent(new CustomEvent("nova:new-folder")), 80);
      },
    },
  ];

  const matches = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  useEffect(() => {
    inputRef.current?.focus();
    setCursor(0);
  }, []);

  useEffect(() => { setCursor(0); }, [query]);

  const confirm = () => matches[cursor]?.action();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape")    { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter")     { confirm(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 fade-in"
         onClick={() => setOpen(false)}>
      <div className="w-[580px] border border-editor-border rounded-xl shadow-2xl overflow-hidden fade-in"
           style={{ background: "rgb(var(--c-sidebar) / 0.92)", backdropFilter: "blur(24px) saturate(1.6)" }}
           onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-editor-border">
          <span className="text-editor-comment font-mono text-sm">&gt;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-editor-fg text-sm outline-none placeholder-editor-comment font-sans"
          />
          <button onClick={() => setOpen(false)} className="text-editor-comment hover:text-editor-fg">
            <X size={14} />
          </button>
        </div>

        {/* Commands */}
        <div className="max-h-72 overflow-y-auto py-1">
          {matches.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                ${i === cursor ? "bg-editor-accent/20" : "hover:bg-editor-line"}`}
              onClick={cmd.action}
              onMouseEnter={() => setCursor(i)}
            >
              <span className={`shrink-0 ${i === cursor ? "text-editor-blue" : "text-editor-comment"}`}>
                {cmd.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-editor-fg">{cmd.label}</div>
                <div className="text-2xs text-editor-comment truncate">{cmd.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
