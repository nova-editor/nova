import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  ChevronRight, ChevronDown,
  FilePlus, FolderPlus, Pencil, Trash2, Copy, FileStack, Clipboard, Search, X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, FileEntry } from "../store";
import { FileIcon }   from "./FileIcon";
import { FolderIcon } from "./FolderIcon";

// ── Context menu ─────────────────────────────────────────────────────────────

interface MenuItem {
  label:   string;
  icon?:   React.ReactNode;
  danger?: boolean;
  sep?:    never;
  action:  () => void;
}
interface Separator { sep: true }
type MenuEntry = MenuItem | Separator;

interface CtxMenuState {
  x:     number;
  y:     number;
  entry: FileEntry;
}

function ContextMenu({
  ctx, workspaceRoot, onClose, onRefreshParent, onRefreshRoot, onRename, onCreateIn,
}: {
  ctx:             CtxMenuState;
  workspaceRoot:   string;
  onClose:         () => void;
  onRefreshParent: (dir: string) => void;
  onRefreshRoot:   () => void;
  onRename:        (entry: FileEntry) => void;
  onCreateIn:      (dir: string, kind: "file" | "folder") => void;
}) {
  const openFile  = useStore((s) => s.openFile);
  const closeTab  = useStore((s) => s.closeTab);
  const tabs      = useStore((s) => s.tabs);
  const setStatus = useStore((s) => s.setStatus);
  const ref       = useRef<HTMLDivElement>(null);

  // Dismiss on outside click or Escape
  useEffect(() => {
    const onDown  = (e: MouseEvent)    => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey   = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const { entry } = ctx;
  const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));

  const doDelete = async () => {
    onClose();
    try {
      // Close any open tabs for this path (or children if dir)
      tabs.forEach((t, i) => {
        if (t.path === entry.path || t.path.startsWith(entry.path + "/")) closeTab(i);
      });
      await invoke("delete_file", { path: entry.path });
      setStatus(`Deleted ${entry.name}`);
      if (parentDir === workspaceRoot) onRefreshRoot();
      else onRefreshParent(parentDir);
    } catch (e) { setStatus(`Delete failed: ${e}`); }
  };

  const doCopyPath = () => {
    navigator.clipboard.writeText(entry.path);
    setStatus("Copied absolute path");
    onClose();
  };

  const doCopyRelPath = () => {
    const rel = entry.path.replace(workspaceRoot + "/", "");
    navigator.clipboard.writeText(rel);
    setStatus("Copied relative path");
    onClose();
  };

  const doDuplicate = async () => {
    onClose();
    if (entry.is_dir) return; // dirs: skip for now
    try {
      const content = await invoke<string>("read_file", { path: entry.path });
      const dot = entry.name.lastIndexOf(".");
      const base = dot > 0 ? entry.name.slice(0, dot) : entry.name;
      const ext  = dot > 0 ? entry.name.slice(dot)    : "";
      const newPath = `${parentDir}/${base}_copy${ext}`;
      await invoke("write_file", { path: newPath, content });
      setStatus(`Duplicated as ${base}_copy${ext}`);
      openFile(newPath);
      if (parentDir === workspaceRoot) onRefreshRoot();
      else onRefreshParent(parentDir);
    } catch (e) { setStatus(`Duplicate failed: ${e}`); }
  };

  const items: MenuEntry[] = entry.is_dir
    ? [
        { label: "New File Here",   icon: <FilePlus   size={13} />, action: () => { onClose(); onCreateIn(entry.path, "file");   } },
        { label: "New Folder Here", icon: <FolderPlus size={13} />, action: () => { onClose(); onCreateIn(entry.path, "folder"); } },
        { sep: true },
        { label: "Rename",      icon: <Pencil    size={13} />, action: () => { onClose(); onRename(entry); } },
        { label: "Copy Path",   icon: <Copy      size={13} />, action: doCopyPath },
        { label: "Copy Rel. Path", icon: <Clipboard size={13} />, action: doCopyRelPath },
        { sep: true },
        { label: "Delete",      icon: <Trash2    size={13} />, danger: true, action: doDelete },
      ]
    : [
        { label: "Rename",         icon: <Pencil    size={13} />, action: () => { onClose(); onRename(entry); } },
        { label: "Duplicate",      icon: <FileStack size={13} />, action: doDuplicate },
        { sep: true },
        { label: "Copy Path",      icon: <Copy      size={13} />, action: doCopyPath },
        { label: "Copy Rel. Path", icon: <Clipboard size={13} />, action: doCopyRelPath },
        { sep: true },
        { label: "Delete",         icon: <Trash2    size={13} />, danger: true, action: doDelete },
      ];

  // Keep menu inside viewport
  const style: React.CSSProperties = { position: "fixed", zIndex: 200 };
  const menuH = items.length * 32;
  style.top  = ctx.y + menuH > window.innerHeight ? ctx.y - menuH : ctx.y;
  style.left = ctx.x + 192  > window.innerWidth   ? ctx.x - 192   : ctx.x;

  return (
    <div
      ref={ref}
      style={style}
      className="w-48 bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl overflow-hidden py-1 fade-in"
    >
      {items.map((item, i) =>
        "sep" in item ? (
          <div key={i} className="my-1 border-t border-editor-border" />
        ) : (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-sans text-left transition-colors
              ${item.danger
                ? "text-red-400 hover:bg-red-500/10"
                : "text-editor-fg hover:bg-white/5"}`}
          >
            <span className={item.danger ? "text-red-400" : "text-editor-comment"}>{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry:           FileEntry;
  depth:           number;
  selectedDir:     string;
  renamingPath:    string | null;
  filter:          string;
  onSelectDir:     (path: string) => void;
  onContextMenu:   (e: React.MouseEvent, entry: FileEntry) => void;
  onRenameCommit:  (entry: FileEntry, newName: string) => void;
  onRenameCancel:  () => void;
  refreshSignal:   number;
}

const TreeNode = memo(function TreeNode({
  entry, depth, selectedDir, renamingPath, filter,
  onSelectDir, onContextMenu, onRenameCommit, onRenameCancel, refreshSignal,
}: TreeNodeProps) {
  const [children, setChildren] = useState<FileEntry[]>([]);
  const toggleDir    = useStore((s) => s.toggleDir);
  const openFile     = useStore((s) => s.openFile);
  const activeTab    = useStore((s) => s.tabs[s.activeTabIdx]?.path);
  const renameRef    = useRef<HTMLInputElement>(null);
  const [renameVal, setRenameVal] = useState("");

  const expanded = useStore((s) => s.expandedDirs.has(entry.path));
  const isActive = activeTab === entry.path;
  const isDirSel = entry.is_dir && selectedDir === entry.path;
  const isRenaming = renamingPath === entry.path;
  const filterLc = filter.toLowerCase();
  // When filtering: hide files that don't match, keep dirs (they may have matching children)
  if (filterLc && !entry.is_dir && !entry.name.toLowerCase().includes(filterLc)) return null;

  const loadChildren = useCallback(async () => {
    try {
      const list = await invoke<FileEntry[]>("list_dir", { path: entry.path });
      setChildren(list);
    } catch { /* denied */ }
  }, [entry.path]);

  const handleClick = async () => {
    if (entry.is_dir) {
      onSelectDir(entry.path);
      toggleDir(entry.path);
      if (!expanded && children.length === 0) await loadChildren();
    } else {
      openFile(entry.path);
    }
  };

  // Auto-expand dirs when filter is active so matches are visible
  useEffect(() => {
    if (filter && entry.is_dir && !expanded) {
      toggleDir(entry.path);
      loadChildren();
    }
  }, [filter]);

  // Reload when expanded or when parent signals a refresh
  useEffect(() => {
    if (expanded && entry.is_dir) loadChildren();
  }, [expanded, refreshSignal]);

  // Listen for targeted refresh from create/rename operations
  useEffect(() => {
    if (!entry.is_dir || !expanded) return;
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === entry.path) loadChildren();
    };
    window.addEventListener("nova:refresh-dir", handler);
    return () => window.removeEventListener("nova:refresh-dir", handler);
  }, [entry.is_dir, entry.path, expanded, loadChildren]);

  // Focus rename input when this node starts renaming
  useEffect(() => {
    if (isRenaming) {
      setRenameVal(entry.name);
      setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 0);
    }
  }, [isRenaming, entry.name]);

  const onRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  { e.preventDefault(); onRenameCommit(entry, renameVal.trim()); }
    if (e.key === "Escape") { onRenameCancel(); }
  };

  return (
    <>
      <div
        className={`tree-item relative flex items-center gap-1.5 cursor-pointer select-none transition-colors text-xs font-mono
          ${isActive ? "active" : ""}`}
        style={{
          paddingLeft: 4 + depth * 6,
          paddingTop: 3,
          paddingBottom: 3,
          color: isActive ? "rgb(var(--c-accent))" : "rgb(var(--c-fg))",
        }}
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
      >
        {entry.is_dir ? (
          <>
            <span className="text-editor-comment shrink-0 flex items-center" style={{ width: 14 }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <FolderIcon name={entry.name} open={expanded} size={16} />
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={onRenameKey}
                onBlur={onRenameCancel}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-editor-line text-editor-fg text-xs font-mono outline-none border border-editor-accent/60 rounded px-1"
              />
            ) : (
              <span className="truncate" style={{ color: "rgb(var(--c-fg))" }}>{entry.name}</span>
            )}
          </>
        ) : (
          <>
            <span style={{ width: 14, flexShrink: 0 }} />
            <FileIcon filename={entry.name} size={16} />
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={onRenameKey}
                onBlur={onRenameCancel}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-editor-line text-editor-fg text-xs font-mono outline-none border border-editor-accent/60 rounded px-1"
              />
            ) : (
              <span className="truncate">{entry.name}</span>
            )}
          </>
        )}
      </div>

      {entry.is_dir && expanded && children.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          selectedDir={selectedDir}
          renamingPath={renamingPath}
          filter={filter}
          onSelectDir={onSelectDir}
          onContextMenu={onContextMenu}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          refreshSignal={refreshSignal}
        />
      ))}
    </>
  );
});

// ── FileTree ──────────────────────────────────────────────────────────────────

export function FileTree() {
  const [roots, setRoots]           = useState<FileEntry[]>([]);
  const [ctxMenu, setCtxMenu]       = useState<CtxMenuState | null>(null);
  const [renamingPath, setRenaming] = useState<string | null>(null);
  const [creating, setCreating]     = useState<{ dir: string; kind: "file" | "folder" } | null>(null);
  const [newName,  setNewName]      = useState("");
  const [selectedDir, setSelectedDir] = useState<string>("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [filter, setFilter]         = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const filterRef   = useRef<HTMLInputElement>(null);
  const dragRef     = useRef<{ startX: number; startW: number } | null>(null);

  const workspaceRoot  = useStore((s) => s.workspaceRoot);
  const openFile       = useStore((s) => s.openFile);
  const setStatus      = useStore((s) => s.setStatus);
  const showFileTree   = useStore((s) => s.showFileTree);
  const toggleFileTree = useStore((s) => s.toggleFileTree);
  const sidebarWidth   = useStore((s) => s.settings.sidebarWidth);
  const updateSettings = useStore((s) => s.updateSettings);
  const tabs           = useStore((s) => s.tabs);
  const closeTab       = useStore((s) => s.closeTab);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: sidebarWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const newW = Math.max(160, Math.min(500, dragRef.current.startW + (ev.clientX - dragRef.current.startX)));
      updateSettings({ sidebarWidth: newW });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  useEffect(() => { setSelectedDir(workspaceRoot); }, [workspaceRoot]);

  const refreshRoots = useCallback(() => {
    if (!workspaceRoot) return;
    invoke<FileEntry[]>("list_dir", { path: workspaceRoot })
      .then(setRoots)
      .catch(() => {});
  }, [workspaceRoot]);

  useEffect(() => { refreshRoots(); }, [refreshRoots]);

  useEffect(() => {
    if (creating) { setNewName(""); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [creating]);

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name   = newName.trim();
    const parent = creating?.dir ?? workspaceRoot;
    if (!name || !parent) { setCreating(null); return; }
    const path = `${parent}/${name}`;
    try {
      if (creating?.kind === "file") {
        await invoke("write_file", { path, content: "" });
        setStatus(`Created ${name}`);
        openFile(path);
      } else {
        await invoke("create_dir", { path });
        setStatus(`Created folder ${name}`);
      }
      if (parent === workspaceRoot) refreshRoots();
      else window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: parent }));
    } catch (e) { setStatus(`Failed: ${e}`); }
    setCreating(null);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  { e.preventDefault(); handleCreate(); }
    if (e.key === "Escape") { setCreating(null); }
  };

  // ── Rename ────────────────────────────────────────────────────────────────
  const handleRenameCommit = async (entry: FileEntry, newNameVal: string) => {
    setRenaming(null);
    if (!newNameVal || newNameVal === entry.name) return;
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const newPath   = `${parentDir}/${newNameVal}`;
    try {
      await invoke("rename_path", { from: entry.path, to: newPath });
      setStatus(`Renamed to ${newNameVal}`);
      // Update any open tab pointing to the old path
      tabs.forEach((t, i) => {
        if (t.path === entry.path) {
          closeTab(i);
          openFile(newPath);
        }
      });
      if (parentDir === workspaceRoot) refreshRoots();
      else window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: parentDir }));
      setRefreshSignal((n) => n + 1);
    } catch (e) { setStatus(`Rename failed: ${e}`); }
  };

  // ── Custom event listeners (from CommandPalette / git checkout) ───────────
  useEffect(() => {
    const onNewFile   = () => { if (!showFileTree) toggleFileTree(); setCreating({ dir: selectedDir || workspaceRoot, kind: "file" });   };
    const onNewFolder = () => { if (!showFileTree) toggleFileTree(); setCreating({ dir: selectedDir || workspaceRoot, kind: "folder" }); };
    // Branch checkout fires nova:refresh-dir with detail = workspaceRoot;
    // reload roots + bump signal so all expanded dirs also refetch.
    const onRefreshDir = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail === workspaceRoot) {
        refreshRoots();
        setRefreshSignal((n) => n + 1);
      }
    };
    window.addEventListener("nova:new-file",    onNewFile);
    window.addEventListener("nova:new-folder",  onNewFolder);
    window.addEventListener("nova:refresh-dir", onRefreshDir);
    return () => {
      window.removeEventListener("nova:new-file",    onNewFile);
      window.removeEventListener("nova:new-folder",  onNewFolder);
      window.removeEventListener("nova:refresh-dir", onRefreshDir);
    };
  }, [showFileTree, toggleFileTree, selectedDir, workspaceRoot, refreshRoots]);

  const rootName   = workspaceRoot.split("/").pop() ?? workspaceRoot;
  const createDir  = creating?.dir ?? workspaceRoot;
  const targetName = createDir === workspaceRoot
    ? rootName
    : createDir.replace(workspaceRoot + "/", "");

  return (
    <div className="flex flex-col border-r border-editor-border overflow-hidden relative"
         style={{ width: sidebarWidth, background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0 border-b border-editor-border"
        style={{ height: 40, background: "rgb(var(--c-header) / var(--surface-alpha, 1))", padding: "0 8px 0 14px" }}
      >
        {/* Workspace name */}
        <span
          className="flex-1 truncate font-sans font-semibold text-editor-comment"
          style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" }}
          title={workspaceRoot}
        >
          {rootName || "Explorer"}
        </span>

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setShowFilter((v) => { if (v) setFilter(""); return !v; }); setTimeout(() => filterRef.current?.focus(), 0); }}
            title="Filter files"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors
              ${showFilter ? "text-editor-accent bg-white/[0.08]" : "text-editor-comment hover:text-editor-fg hover:bg-white/[0.08]"}`}
          >
            <Search size={12} />
          </button>
          <button
            onClick={() => setCreating({ dir: selectedDir || workspaceRoot, kind: "file" })}
            title="New File"
            className="flex items-center justify-center w-6 h-6 rounded text-editor-comment hover:text-editor-fg hover:bg-white/[0.08] transition-colors"
          >
            <FilePlus size={13} />
          </button>
          <button
            onClick={() => setCreating({ dir: selectedDir || workspaceRoot, kind: "folder" })}
            title="New Folder"
            className="flex items-center justify-center w-6 h-6 rounded text-editor-comment hover:text-editor-fg hover:bg-white/[0.08] transition-colors"
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      {/* ── Filter input ─────────────────────────────────────────────────── */}
      {showFilter && (
        <div className="flex items-center gap-1.5 shrink-0 border-b border-editor-border px-2 py-1.5" style={{ background: "rgb(var(--c-header) / var(--surface-alpha, 1))" }}>
          <Search size={11} className="text-editor-comment shrink-0" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setFilter(""); setShowFilter(false); } }}
            placeholder="Filter files…"
            className="flex-1 bg-transparent text-xs font-mono text-editor-fg outline-none placeholder-editor-comment/40"
          />
          {filter && (
            <button onClick={() => setFilter("")} className="text-editor-comment hover:text-editor-fg transition-colors">
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {/* ── Inline create input ──────────────────────────────────────────── */}
      {creating && (
        <div
          className="flex items-center gap-2 shrink-0 border-b border-editor-border"
          style={{ padding: "5px 10px", background: "rgb(var(--c-sidebar) / var(--surface-alpha, 1))" }}
        >
          {creating.kind === "file"
            ? <FilePlus   size={12} className="text-editor-accent shrink-0" />
            : <FolderPlus size={12} className="text-editor-yellow shrink-0" />}
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onInputKey}
            onBlur={() => setCreating(null)}
            placeholder={`${targetName}/…`}
            className="flex-1 bg-transparent text-xs font-mono text-editor-fg outline-none placeholder-editor-comment/40 border-b border-editor-accent/50 pb-px"
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {roots.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            selectedDir={selectedDir}
            renamingPath={renamingPath}
            filter={filter}
            onSelectDir={setSelectedDir}
            onContextMenu={(e, en) => setCtxMenu({ x: e.clientX, y: e.clientY, entry: en })}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={() => setRenaming(null)}
            refreshSignal={refreshSignal}
          />
        ))}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          ctx={ctxMenu}
          workspaceRoot={workspaceRoot}
          onClose={() => setCtxMenu(null)}
          onRefreshParent={(dir) => window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: dir }))}
          onRefreshRoot={refreshRoots}
          onRename={(en) => setRenaming(en.path)}
          onCreateIn={(dir, kind) => setCreating({ dir, kind })}
        />
      )}

      {/* Drag handle — right edge */}
      <div
        onMouseDown={onDragStart}
        className="absolute top-0 right-0 h-full w-1 cursor-col-resize z-10 hover:bg-editor-accent/40 transition-colors"
        style={{ userSelect: "none" }}
      />
    </div>
  );
}
