import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FolderOpen, FilePlus, BookOpen, SlidersHorizontal,
  GitMerge, Terminal as TerminalIcon, Files, Keyboard,
  SplitSquareHorizontal, X, Bot,
} from "lucide-react";
import { useStore } from "./store";
import { applyThemeVars } from "./theme/themes";
import { FileTree }        from "./components/FileTree";
import { TabBar }          from "./components/TabBar";
import { Editor }          from "./components/Editor";
import { Terminal }        from "./components/Terminal";
import { GitPanel }        from "./components/GitPanel";
import { StatusBar }       from "./components/StatusBar";
import { FuzzyFinder }     from "./components/FuzzyFinder";
import { CommandPalette }  from "./components/CommandPalette";
import { HelpPanel }       from "./components/HelpPanel";
import { AITerminal }      from "./components/AITerminal";
import { AILauncherPage }  from "./components/AILauncherPage";
import { PinnedTerminal }  from "./components/PinnedTerminal";
import { HtmlViewerTab }  from "./components/HtmlViewerTab";
import { PdfViewerTab }   from "./components/PdfViewerTab";
import { MdPreviewTab }        from "./components/MdPreviewTab";
import { NotebookViewerTab }  from "./components/NotebookViewerTab";
import { SettingsPanel }      from "./components/Settings";
import { SpotifyPlayer }   from "./components/SpotifyPlayer";

function TitleBtn({ onClick, title, active, children }: {
  onClick: () => void; title: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors
        ${active
          ? "text-editor-fg"
          : "text-editor-comment hover:text-editor-fg hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const showFileTree  = useStore((s) => s.showFileTree);
  const showTerminal  = useStore((s) => s.showTerminal);
  const showGitPanel  = useStore((s) => s.showGitPanel);
  const fuzzyOpen     = useStore((s) => s.fuzzyOpen);
  const paletteOpen   = useStore((s) => s.paletteOpen);
  const showHelp      = useStore((s) => s.showHelp);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const zenMode       = useStore((s) => s.zenMode);

  // Two-pane state
  const leftPane      = useStore((s) => s.leftPane);
  const rightPane     = useStore((s) => s.rightPane);
  const focusedPane   = useStore((s) => s.focusedPane);

  const setWorkspaceRoot  = useStore((s) => s.setWorkspaceRoot);
  const initCwd           = useStore((s) => s.initCwd);
  const toggleFileTree    = useStore((s) => s.toggleFileTree);
  const toggleTerminal    = useStore((s) => s.toggleTerminal);
  const toggleGitPanel    = useStore((s) => s.toggleGitPanel);
  const toggleZenMode     = useStore((s) => s.toggleZenMode);
  const setFuzzyOpen      = useStore((s) => s.setFuzzyOpen);
  const setPaletteOpen    = useStore((s) => s.setPaletteOpen);
  const saveTab           = useStore((s) => s.saveTab);
  const closeTab          = useStore((s) => s.closeTab);
  const setActiveTab      = useStore((s) => s.setActiveTab);
  const setFocusedPane    = useStore((s) => s.setFocusedPane);
  const openFile          = useStore((s) => s.openFile);
  const toggleHelp        = useStore((s) => s.toggleHelp);
  const showSettings      = useStore((s) => s.showSettings);
  const toggleSettings    = useStore((s) => s.toggleSettings);
  const showSpotify       = useStore((s) => s.showSpotify);
  const toggleSpotify     = useStore((s) => s.toggleSpotify);
  const cyclePreset       = useStore((s) => s.cyclePreset);
  const openAiTab             = useStore((s) => s.openAiTab);
  const openPinnedTerminal    = useStore((s) => s.openPinnedTerminal);

  const openAiLauncher    = useStore((s) => s.openAiLauncher);
  const openHtmlViewer    = useStore((s) => s.openHtmlViewer);
  const openMdPreview     = useStore((s) => s.openMdPreview);
  const openPdfViewer     = useStore((s) => s.openPdfViewer);
  const splitEditor       = useStore((s) => s.splitEditor);
  const closeSplit        = useStore((s) => s.closeSplit);
  const settings          = useStore((s) => s.settings);
  const updateSettings    = useStore((s) => s.updateSettings);
  const theme             = useStore((s) => s.settings.editor.theme);
  const fullDark          = useStore((s) => s.settings.fullDark);
  const bg                = useStore((s) => s.settings.background);

  // Apply CSS vars immediately on theme/fullDark change
  useEffect(() => { applyThemeVars(theme, fullDark); }, [theme, fullDark]);

  // Set default cwd for terminal — does NOT open file tree
  useEffect(() => {
    invoke<string>("get_cwd")
      .then((cwd) => initCwd(cwd))
      .catch(() => {});
  }, [initCwd]);

  // Open folder passed as CLI argument: `nova /path/to/folder`
  useEffect(() => {
    invoke<string | null>("get_startup_path")
      .then((path) => { if (path) setWorkspaceRoot(path); })
      .catch(() => {});
  }, [setWorkspaceRoot]);

  const openFileDialog = async () => {
    try {
      const selected = await open({ multiple: false, directory: false });
      if (typeof selected === "string") {
        getCurrentWindow().setFocus().catch(() => {});
        await openFile(selected);
      }
    } catch { /* cancelled */ }
  };

  const openFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setWorkspaceRoot(selected);
        // Reclaim focus after dialog — non-blocking, don't let it block setWorkspaceRoot
        getCurrentWindow().setFocus().catch(() => {});
      }
    } catch { /* cancelled */ }
  };

  // Listen for native macOS menu events.
  // IMPORTANT: use getCurrentWindow().listen() not the global listen() — in Tauri v2
  // the global listen() receives events emitted to ANY window, so every open window
  // would react to every menu action. Per-window listen scopes it correctly.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistens: Array<() => void> = [];
    (async () => {
      unlistens.push(await win.listen("menu://new-file",        () => window.dispatchEvent(new CustomEvent("nova:new-file"))));
      unlistens.push(await win.listen("menu://open-file",       openFileDialog));
      unlistens.push(await win.listen("menu://open-folder",     openFolder));
      unlistens.push(await win.listen("menu://save",            () => {
        const s = useStore.getState();
        const pane = s.focusedPane === "right" && s.rightPane ? s.rightPane : s.leftPane;
        const tab  = pane.tabs[pane.activeIdx];
        if (tab) s.saveTab(tab.path);
      }));
      unlistens.push(await win.listen("menu://close-tab",       () => {
        const s = useStore.getState();
        const key = s.focusedPane === "right" && s.rightPane ? "right" : "left";
        const pane = key === "right" ? s.rightPane! : s.leftPane;
        if (pane.tabs.length > 0) s.closeTab(pane.activeIdx, key);
      }));
      unlistens.push(await win.listen("menu://new-window",      () => invoke("new_window").catch(() => {})));
      unlistens.push(await win.listen("menu://toggle-tree",     () => toggleFileTree()));
      unlistens.push(await win.listen("menu://toggle-terminal", () => toggleTerminal()));
      unlistens.push(await win.listen("menu://toggle-git",      () => toggleGitPanel()));
      unlistens.push(await win.listen("menu://toggle-settings", () => toggleSettings()));
      unlistens.push(await win.listen("menu://go-file",         () => setFuzzyOpen(!useStore.getState().fuzzyOpen)));
      unlistens.push(await win.listen("menu://go-palette",      () => setPaletteOpen(!useStore.getState().paletteOpen)));
      unlistens.push(await win.listen("menu://help-shortcuts",  () => toggleHelp()));
    })();
    return () => unlistens.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts
  const awaitingKChord = useRef(false);
  void awaitingKChord; // referenced for future chord support
  const lastCloseMs = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl    = e.ctrlKey || e.metaKey;
      const tag     = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      if (ctrl && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault(); toggleZenMode(); return;
      }
      if (!fuzzyOpen && !paletteOpen) {
        if (ctrl && e.key === "b") { e.preventDefault(); toggleFileTree();  return; }
        if (ctrl && e.key === "j") { e.preventDefault(); toggleTerminal();  return; }
        if (ctrl && e.key === "g") { e.preventDefault(); toggleGitPanel();  return; }
        if (ctrl && e.key === ",") { e.preventDefault(); toggleSettings();  return; }
        if (ctrl && e.key === "h") { e.preventDefault(); toggleHelp();      return; }
        if (ctrl && e.shiftKey && (e.key === "O" || e.key === "o")) { e.preventDefault(); openFolder(); return; }
if (ctrl && e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); openAiLauncher(); return; }
        if (ctrl && e.shiftKey && (e.key === "M" || e.key === "m")) { e.preventDefault(); toggleSpotify(); return; }
        if (ctrl && e.shiftKey && (e.key === "L" || e.key === "l")) { e.preventDefault(); openPinnedTerminal(); return; }
        if (ctrl && e.shiftKey && (e.key === "R" || e.key === "r")) { e.preventDefault(); openHtmlViewer(); return; }
        if (ctrl && e.shiftKey && (e.key === "?" || e.key === "/")) { e.preventDefault(); openPdfViewer();  return; }
        if (ctrl && e.key === "\\") { e.preventDefault(); cyclePreset(); return; }
        if (ctrl && e.key === "n" && !e.shiftKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent("nova:new-file")); return; }
        if (ctrl && e.key === "t") { e.preventDefault(); window.dispatchEvent(new CustomEvent("nova:new-terminal")); return; }
        if (ctrl && e.shiftKey && (e.key === "N" || e.key === "n")) {
          e.preventDefault();
          invoke("new_window").catch(() => {});
          return;
        }
      }
      if (ctrl && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault(); e.stopPropagation();
        setPaletteOpen(!paletteOpen); return;
      }
      if (ctrl && !e.shiftKey && e.key === "p") {
        e.preventDefault(); e.stopPropagation();
        setFuzzyOpen(!fuzzyOpen); return;
      }
      if (ctrl && e.key === "s" && !inInput) {
        e.preventDefault();
        const st  = useStore.getState();
        const key = st.focusedPane === "right" && st.rightPane ? "right" : "left";
        const p   = key === "right" ? st.rightPane! : st.leftPane;
        const tab = p.tabs[p.activeIdx];
        if (tab) st.saveTab(tab.path);
        return;
      }
      if (ctrl && e.key === "w" && !inInput) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastCloseMs.current < 350) return; // debounce key-repeat
        lastCloseMs.current = now;
        const st  = useStore.getState();
        const key = st.focusedPane === "right" && st.rightPane ? "right" : "left";
        const p   = key === "right" ? st.rightPane! : st.leftPane;
        if (p.tabs.length > 0) st.closeTab(p.activeIdx, key);
        return;
      }

      const inXterm = !!(document.activeElement?.closest?.(".xterm"));
      if (ctrl && !inXterm && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        updateSettings({ editor: { fontSize: Math.min(32, settings.editor.fontSize + 1) } });
        return;
      }
      if (ctrl && !inXterm && e.key === "-") {
        e.preventDefault();
        updateSettings({ editor: { fontSize: Math.max(8, settings.editor.fontSize - 1) } });
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    fuzzyOpen, paletteOpen, zenMode,
    toggleFileTree, toggleTerminal, toggleGitPanel, toggleSettings, toggleHelp, toggleSpotify, toggleZenMode, cyclePreset, openAiLauncher, openPinnedTerminal, openHtmlViewer, openPdfViewer, openFolder,
    setFuzzyOpen, setPaletteOpen,
    settings.editor.fontSize, updateSettings,
  ]);

  // Derived
  const leftActiveTab  = leftPane.tabs[leftPane.activeIdx];
  const rightActiveTab = rightPane?.tabs[rightPane.activeIdx];

  const isMarkdown      = leftActiveTab?.language === "markdown" && leftActiveTab?.kind !== "ai";
  const mdPreviewOpen   = isMarkdown && (
    leftPane.tabs.some((t) => t.path === `__md-preview__${leftActiveTab?.path}`) ||
    !!rightPane?.tabs.some((t) => t.path === `__md-preview__${leftActiveTab?.path}`)
  );

  // AI active indicator for title bar button
  const aiIsOpen = leftActiveTab?.kind === "ai" || rightActiveTab?.kind === "ai"
    || leftActiveTab?.kind === "ai-launcher" || rightActiveTab?.kind === "ai-launcher";

  // Split editor drag
  const [splitRatio,  setSplitRatio]  = useState(0.5);
  const [isSplitDrag, setIsSplitDrag] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const onSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsSplitDrag(true);
    const onMove = (mv: MouseEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const { left, width } = container.getBoundingClientRect();
      const ratio = Math.max(0.15, Math.min(0.85, (mv.clientX - left) / width));
      setSplitRatio(ratio);
    };
    const onUp = () => {
      setIsSplitDrag(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background image data URL
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bg.imagePath || !bg.enabled) {
      setBgDataUrl(null);
      document.documentElement.style.setProperty("--surface-alpha", "1");
      return;
    }
    invoke<string>("read_file_base64", { path: bg.imagePath })
      .then((url) => {
        setBgDataUrl(url);
        document.documentElement.style.setProperty("--surface-alpha", "0");
      })
      .catch(() => {
        setBgDataUrl(null);
        document.documentElement.style.setProperty("--surface-alpha", "1");
      });
  }, [bg.imagePath, bg.enabled]);
  const bgSrc = bgDataUrl;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-editor-bg text-editor-fg select-none" style={{ position: "relative" }}>

      {/* ── Background image layer ────────────────────────────────────────── */}
      {bgSrc && (
        <div
          aria-hidden
          style={{
            position:        "absolute",
            inset:           0,
            zIndex:          0,
            backgroundImage: `url("${bgSrc}")`,
            backgroundSize:  "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity:         bg.opacity,
            filter:          bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
            pointerEvents:   "none",
          }}
        />
      )}
      {bgSrc && (
        <div
          aria-hidden
          style={{
            position:      "absolute",
            inset:         0,
            zIndex:        0,
            background:    `rgb(var(--c-deep))`,
            opacity:       bg.tint,
            pointerEvents: "none",
          }}
        />
      )}

      {/* All actual content sits above the background */}
      <div className="relative flex flex-col h-full w-full" style={{ zIndex: 1 }}>

      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      {!zenMode && <div className="flex items-center shrink-0 px-2 gap-1 border-b border-editor-border"
           style={{ height: 36, background: "rgb(var(--c-header) / var(--surface-alpha, 1))" }}>

        <TitleBtn onClick={toggleFileTree} title="Explorer (⌘B)"           active={showFileTree}><Files size={14} /></TitleBtn>
        <TitleBtn onClick={toggleGitPanel} title="Source control (⌘G)"     active={showGitPanel}><GitMerge size={14} /></TitleBtn>
        <TitleBtn onClick={toggleTerminal} title="Terminal (⌘J)"            active={showTerminal}><TerminalIcon size={14} /></TitleBtn>
        <TitleBtn
          onClick={openAiLauncher}
          title="AI Agents (⌘⇧C)"
          active={aiIsOpen}
        >
          <Bot size={14} />
        </TitleBtn>
        <TitleBtn
          onClick={() => rightPane !== null ? closeSplit() : splitEditor()}
          title={rightPane !== null ? "Close split" : "Split editor"}
          active={rightPane !== null}
        >
          <SplitSquareHorizontal size={14} />
        </TitleBtn>
        <div className="w-px h-4 bg-editor-border mx-0.5 shrink-0" />

        <TitleBtn onClick={openFileDialog} title="Open File (⌘O)"><FilePlus size={14} /></TitleBtn>
        <TitleBtn onClick={openFolder}     title="Open Folder (⌘⇧O)"><FolderOpen size={14} /></TitleBtn>

        <div className="flex-1" />

        {isMarkdown && (
          <button
            onClick={() => leftActiveTab && openMdPreview(leftActiveTab.path)}
            title={mdPreviewOpen ? "Preview tab already open" : "Open preview tab"}
            className={`flex items-center gap-1 px-2 h-6 rounded text-2xs font-mono transition-colors
              ${mdPreviewOpen ? "text-editor-accent bg-editor-accent/10" : "text-editor-comment hover:text-editor-fg hover:bg-white/5"}`}
          >
            <BookOpen size={12} /><span>preview</span>
          </button>
        )}

        <TitleBtn onClick={toggleSettings} title="Settings (⌘,)"          active={showSettings}><SlidersHorizontal size={14} /></TitleBtn>
        <TitleBtn onClick={toggleHelp}     title="Keyboard shortcuts (⌘H)" active={showHelp}><Keyboard size={14} /></TitleBtn>
      </div>}

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative" }}>

        {showFileTree && <FileTree />}

        <div className="flex flex-col flex-1 overflow-hidden">

          {/* ── Tab bar row — left + right bars at the same 30px height ─── */}
          <div className="flex shrink-0 overflow-hidden" style={{ height: 30 }}>

            {/* Left tab bar */}
            <div
              className="overflow-hidden flex"
              style={{ flex: rightPane !== null ? splitRatio : 1, minWidth: 0 }}
              onClick={() => setFocusedPane("left")}
            >
              <TabBar
                tabs={leftPane.tabs}
                activeIdx={leftPane.activeIdx}
                onSetActive={(i) => setActiveTab(i, "left")}
                onClose={(i) => closeTab(i, "left")}
              />
            </div>

            {/* Right tab bar */}
            {rightPane !== null && (
              <div className="flex shrink-0 overflow-hidden" style={{ flex: 1 - splitRatio, minWidth: 0 }}
                   onClick={() => setFocusedPane("right")}>
                {/* 3px spacer aligned with drag handle */}
                <div style={{ width: 3, background: "rgb(var(--c-border))", flexShrink: 0 }} />

                {/* Tabs */}
                <TabBar
                  tabs={rightPane.tabs}
                  activeIdx={rightPane.activeIdx}
                  onSetActive={(i) => setActiveTab(i, "right")}
                  onClose={(i) => closeTab(i, "right")}
                />

                {/* Close-split button */}
                <button
                  onClick={(e) => { e.stopPropagation(); closeSplit(); }}
                  title="Close split"
                  className="flex items-center justify-center shrink-0 transition-colors hover:bg-white/[0.08] group/closesplit"
                  style={{
                    width:        28,
                    borderBottom: "1px solid rgb(var(--c-selection))",
                    background:   "rgb(var(--c-sidebar) / var(--surface-alpha, 1))",
                  }}
                >
                  <X size={12} className="text-editor-comment group-hover/closesplit:text-editor-fg transition-colors" />
                </button>
              </div>
            )}
          </div>

          {/* ── Editor area ──────────────────────────────────────────────── */}
          <div
            ref={splitContainerRef}
            className="flex flex-1 min-h-0 overflow-hidden"
            style={{ position: "relative", cursor: isSplitDrag ? "ew-resize" : undefined }}
          >
            {/* ── Left pane ─────────────────────────────────────────────── */}
            <div
              className="flex flex-col overflow-hidden"
              style={{ flex: rightPane !== null ? splitRatio : 1, minWidth: 100, position: "relative" }}
              onClick={() => setFocusedPane("left")}
            >
              {leftActiveTab?.kind === "ai-launcher" && <AILauncherPage tabPath={leftActiveTab.path} />}
              {leftActiveTab && leftActiveTab.kind !== "ai" && leftActiveTab.kind !== "ai-launcher" && leftActiveTab.kind !== "pinned-terminal" && leftActiveTab.kind !== "html-viewer" && leftActiveTab.kind !== "pdf-viewer" && leftActiveTab.kind !== "md-preview" && leftActiveTab.kind !== "notebook-viewer" && (
                <Editor tab={leftActiveTab} />
              )}
              {!leftActiveTab && (
                workspaceRoot ? (
                  <div className="flex-1" style={{ background: bgSrc ? "transparent" : "rgb(var(--c-deep))" }} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full select-none"
                       style={{ background: bgSrc ? "transparent" : "rgb(var(--c-deep))", gap: 36 }}>
                    <span style={{ fontSize: 88, fontFamily: "Inter, sans-serif", fontWeight: 600, lineHeight: 1, color: "rgb(var(--c-accent) / 0.12)" }}>の</span>
                    <div className="flex flex-col items-center gap-1.5">
                      {([
                        { icon: <FolderOpen size={13} />, label: "Open Folder", kbd: "⌘⇧O", onClick: openFolder },
                        { icon: <FilePlus   size={13} />, label: "Open File",   kbd: "⌘O",   onClick: openFileDialog },
                      ] as const).map(({ icon, label, kbd, onClick }) => (
                        <button
                          key={label}
                          onClick={onClick}
                          className="flex items-center gap-2 px-3 py-1.5 rounded transition-colors"
                          style={{ color: "rgb(var(--c-gutter))", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-fg))"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgb(var(--c-gutter))"; }}
                        >
                          {icon}
                          <span>{label}</span>
                          <span style={{ marginLeft: 6, color: "rgb(var(--c-border))", fontSize: 10 }}>{kbd}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* AI terminals for left pane — one per AI tab, show only the active one */}
              {leftPane.tabs.filter((t) => t.kind === "ai").map((t) => (
                <AITerminal
                  key={t.path}
                  tab={t}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
              {/* Pinned terminal tabs — left pane */}
              {leftPane.tabs.filter((t) => t.kind === "pinned-terminal").map((t) => (
                <PinnedTerminal
                  key={t.path}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
              {/* HTML viewer tabs — left pane */}
              {leftPane.tabs.filter((t) => t.kind === "html-viewer").map((t) => (
                <HtmlViewerTab
                  key={t.path}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
              {/* PDF viewer tabs — left pane */}
              {leftPane.tabs.filter((t) => t.kind === "pdf-viewer").map((t) => (
                <PdfViewerTab
                  key={t.path}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
              {/* Markdown preview tabs — left pane */}
              {leftPane.tabs.filter((t) => t.kind === "md-preview").map((t) => (
                <MdPreviewTab
                  key={t.path}
                  tab={t}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
              {/* Notebook viewer tabs — left pane */}
              {leftPane.tabs.filter((t) => t.kind === "notebook-viewer").map((t) => (
                <NotebookViewerTab
                  key={t.path}
                  tab={t}
                  visible={leftPane.tabs[leftPane.activeIdx]?.path === t.path}
                />
              ))}
            </div>

            {/* ── Drag handle ───────────────────────────────────────────── */}
            {rightPane !== null && (
              <div
                onMouseDown={onSplitDragStart}
                className="group shrink-0"
                style={{ width: 3, cursor: "ew-resize", background: "rgb(var(--c-border))", position: "relative", zIndex: 2 }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgb(var(--c-accent))" }} />
              </div>
            )}

            {/* ── Right pane ────────────────────────────────────────────── */}
            {rightPane !== null && (
              <div
                className="flex flex-col overflow-hidden"
                style={{ flex: 1 - splitRatio, minWidth: 100, position: "relative" }}
                onClick={() => setFocusedPane("right")}
              >
                {/* Render editor only for non-AI, non-launcher active tabs */}
                {rightActiveTab?.kind === "ai-launcher" && <AILauncherPage tabPath={rightActiveTab.path} />}
                {rightActiveTab && rightActiveTab.kind !== "ai" && rightActiveTab.kind !== "ai-launcher" && rightActiveTab.kind !== "pinned-terminal" && rightActiveTab.kind !== "html-viewer" && rightActiveTab.kind !== "pdf-viewer" && rightActiveTab.kind !== "md-preview" && rightActiveTab.kind !== "notebook-viewer" && (
                  <Editor tab={rightActiveTab} />
                )}

                {/* AI terminals for right pane */}
                {rightPane.tabs.filter((t) => t.kind === "ai").map((t) => (
                  <AITerminal
                    key={t.path}
                    tab={t}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
                {/* Pinned terminal tabs — right pane */}
                {rightPane.tabs.filter((t) => t.kind === "pinned-terminal").map((t) => (
                  <PinnedTerminal
                    key={t.path}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
                {/* HTML viewer tabs — right pane */}
                {rightPane.tabs.filter((t) => t.kind === "html-viewer").map((t) => (
                  <HtmlViewerTab
                    key={t.path}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
                {/* PDF viewer tabs — right pane */}
                {rightPane.tabs.filter((t) => t.kind === "pdf-viewer").map((t) => (
                  <PdfViewerTab
                    key={t.path}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
                {/* Markdown preview tabs — right pane */}
                {rightPane.tabs.filter((t) => t.kind === "md-preview").map((t) => (
                  <MdPreviewTab
                    key={t.path}
                    tab={t}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
                {/* Notebook viewer tabs — right pane */}
                {rightPane.tabs.filter((t) => t.kind === "notebook-viewer").map((t) => (
                  <NotebookViewerTab
                    key={t.path}
                    tab={t}
                    visible={rightPane.tabs[rightPane.activeIdx]?.path === t.path}
                  />
                ))}
              </div>
            )}
          </div>{/* end editor area */}

          {/* Always mounted — CSS hide preserves PTY sessions */}
          <Terminal visible={showTerminal} />
        </div>

        {showGitPanel && <GitPanel />}
      </div>

      {!zenMode && <StatusBar />}

      {/* Overlays */}
      {fuzzyOpen   && <FuzzyFinder />}
      {paletteOpen && <CommandPalette />}
      {showHelp     && <HelpPanel onClose={toggleHelp} />}
      {showSettings && <SettingsPanel />}
      {showSpotify  && <SpotifyPlayer onClose={toggleSpotify} />}
      </div>
    </div>
  );
}
