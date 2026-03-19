import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  FolderOpen, FilePlus, BookOpen, SlidersHorizontal,
  GitMerge, Terminal as TerminalIcon, Files, Keyboard,
} from "lucide-react";
import { useStore } from "./store";
import { applyThemeVars } from "./theme/themes";
import { FileTree }       from "./components/FileTree";
import { TabBar }         from "./components/TabBar";
import { Editor }         from "./components/Editor";
import { Terminal }       from "./components/Terminal";
import { GitPanel }       from "./components/GitPanel";
import { StatusBar }      from "./components/StatusBar";
import { FuzzyFinder }    from "./components/FuzzyFinder";
import { CommandPalette } from "./components/CommandPalette";
import { HelpPanel }      from "./components/HelpPanel";
import { SettingsPanel }  from "./components/Settings";
import { SpotifyPlayer }  from "./components/SpotifyPlayer";

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
  const tabs          = useStore((s) => s.tabs);
  const activeTabIdx  = useStore((s) => s.activeTabIdx);
  const workspaceRoot = useStore((s) => s.workspaceRoot);

  const setWorkspaceRoot  = useStore((s) => s.setWorkspaceRoot);
  const initCwd           = useStore((s) => s.initCwd);
  const toggleFileTree    = useStore((s) => s.toggleFileTree);
  const toggleTerminal    = useStore((s) => s.toggleTerminal);
  const toggleGitPanel    = useStore((s) => s.toggleGitPanel);
  const setFuzzyOpen      = useStore((s) => s.setFuzzyOpen);
  const setPaletteOpen    = useStore((s) => s.setPaletteOpen);
  const saveTab           = useStore((s) => s.saveTab);
  const closeTab          = useStore((s) => s.closeTab);
  const openFile          = useStore((s) => s.openFile);
  const toggleHelp        = useStore((s) => s.toggleHelp);
  const showSettings      = useStore((s) => s.showSettings);
  const toggleSettings    = useStore((s) => s.toggleSettings);
  const showSpotify       = useStore((s) => s.showSpotify);
  const toggleSpotify     = useStore((s) => s.toggleSpotify);
  const cyclePreset       = useStore((s) => s.cyclePreset);
  const settings          = useStore((s) => s.settings);
  const updateSettings    = useStore((s) => s.updateSettings);
  const theme             = useStore((s) => s.settings.editor.theme);
  const fullDark          = useStore((s) => s.settings.fullDark);
  const bg                = useStore((s) => s.settings.background);

  // Apply CSS vars immediately on theme/fullDark change (and on mount for initial values)
  useEffect(() => { applyThemeVars(theme, fullDark); }, [theme, fullDark]);

  // Set default cwd for terminal — does NOT open file tree
  useEffect(() => {
    invoke<string>("get_cwd")
      .then((cwd) => initCwd(cwd))
      .catch(() => {});
  }, [initCwd]);

  const openFileDialog = async () => {
    try {
      const selected = await open({ multiple: false, directory: false });
      if (typeof selected === "string") await openFile(selected);
    } catch { /* cancelled */ }
  };

  const openFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") setWorkspaceRoot(selected);
    } catch { /* cancelled */ }
  };

  // Listen for native macOS menu events
  useEffect(() => {
    const unlistens: Array<() => void> = [];
    (async () => {
      unlistens.push(await listen("menu://new-file",        () => window.dispatchEvent(new CustomEvent("nova:new-file"))));
      unlistens.push(await listen("menu://open-file",       openFileDialog));
      unlistens.push(await listen("menu://open-folder",     openFolder));
      unlistens.push(await listen("menu://save",            () => saveTab(activeTabIdx)));
      unlistens.push(await listen("menu://close-tab",       () => { if (tabs.length > 0) closeTab(activeTabIdx); }));
      unlistens.push(await listen("menu://new-window",      () => invoke("new_window").catch(() => {})));
      unlistens.push(await listen("menu://toggle-tree",     () => toggleFileTree()));
      unlistens.push(await listen("menu://toggle-terminal", () => toggleTerminal()));
      unlistens.push(await listen("menu://toggle-git",      () => toggleGitPanel()));
      unlistens.push(await listen("menu://toggle-settings", () => toggleSettings()));
      unlistens.push(await listen("menu://go-file",         () => setFuzzyOpen(!useStore.getState().fuzzyOpen)));
      unlistens.push(await listen("menu://go-palette",      () => setPaletteOpen(!useStore.getState().paletteOpen)));
      unlistens.push(await listen("menu://help-shortcuts",  () => toggleHelp()));
    })();
    return () => unlistens.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length, activeTabIdx]);

  // Global keyboard shortcuts (capture: true fires before CodeMirror)
  const awaitingKChord = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const tag  = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      if (!fuzzyOpen && !paletteOpen) {
        if (ctrl && e.key === "b") { e.preventDefault(); toggleFileTree();  return; }
        if (ctrl && e.key === "j") { e.preventDefault(); toggleTerminal();  return; }
        if (ctrl && e.key === "g") { e.preventDefault(); toggleGitPanel();  return; }
        if (ctrl && e.key === ",") { e.preventDefault(); toggleSettings();  return; }
        if (ctrl && e.key === "h") { e.preventDefault(); toggleHelp();      return; }
        if (ctrl && e.shiftKey && (e.key === "M" || e.key === "m")) { e.preventDefault(); toggleSpotify(); return; }
        if (ctrl && e.key === "\\") { e.preventDefault(); cyclePreset(); return; }
        if (ctrl && e.key === "n" && !e.shiftKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent("nova:new-file"));   return; }
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
        e.preventDefault(); saveTab(activeTabIdx); return;
      }
      if (ctrl && e.key === "w" && !inInput) {
        e.preventDefault();
        if (tabs.length > 0) closeTab(activeTabIdx);
        return;
      }

      // Editor font size — skip when xterm has focus (terminal handles its own zoom)
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
    activeTabIdx, tabs.length, fuzzyOpen, paletteOpen,
    toggleFileTree, toggleTerminal, toggleGitPanel, toggleSettings, toggleHelp, toggleSpotify, cyclePreset,
    setFuzzyOpen, setPaletteOpen, saveTab, closeTab,
    settings.editor.fontSize, updateSettings,
  ]);

  const activeTab = tabs[activeTabIdx];
  const isMarkdown = activeTab?.language === "markdown";
  const [showMdPreview, setShowMdPreview] = useState(false);

  // Background image data URL — loaded once when path changes
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
      {/* Dark tint overlay so text stays readable */}
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
      <div className="flex items-center shrink-0 px-2 gap-1 border-b border-editor-border"
           style={{ height: 36, background: "rgb(var(--c-header) / var(--surface-alpha, 1))" }}>

        <TitleBtn onClick={toggleFileTree} title="Explorer (⌘B)"       active={showFileTree}><Files size={14} /></TitleBtn>
        <TitleBtn onClick={toggleGitPanel} title="Source control (⌘G)" active={showGitPanel}><GitMerge size={14} /></TitleBtn>
        <TitleBtn onClick={toggleTerminal} title="Terminal (⌘J)"       active={showTerminal}><TerminalIcon size={14} /></TitleBtn>
        <div className="w-px h-4 bg-editor-border mx-0.5 shrink-0" />

        <TitleBtn onClick={openFileDialog} title="Open File (⌘O)"><FilePlus size={14} /></TitleBtn>
        <TitleBtn onClick={openFolder}     title="Open Folder (⌘⇧O)"><FolderOpen size={14} /></TitleBtn>

        <div className="flex-1" />

        {isMarkdown && (
          <button
            onClick={() => setShowMdPreview((v) => !v)}
            title={showMdPreview ? "Hide preview" : "Show preview"}
            className={`flex items-center gap-1 px-2 h-6 rounded text-2xs font-mono transition-colors
              ${showMdPreview ? "text-editor-accent bg-editor-accent/10" : "text-editor-comment hover:text-editor-fg hover:bg-white/5"}`}
          >
            <BookOpen size={12} /><span>preview</span>
          </button>
        )}

        <TitleBtn onClick={toggleSettings} title="Settings (⌘,)"         active={showSettings}><SlidersHorizontal size={14} /></TitleBtn>
        <TitleBtn onClick={toggleHelp}     title="Keyboard shortcuts (⌘H)" active={showHelp}><Keyboard size={14} /></TitleBtn>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {showFileTree && <FileTree />}

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar />

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {activeTab ? (
              <Editor tabIndex={activeTabIdx} showMdPreview={showMdPreview} />
            ) : workspaceRoot ? (
              // Folder open but no file selected — blank canvas
              <div className="flex-1" style={{ background: bgSrc ? "transparent" : "rgb(var(--c-deep))" }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full select-none" style={{ background: bgSrc ? "transparent" : "rgb(var(--c-deep))", gap: 36 }}>
                {/* Logo — original font */}
                <span style={{ fontSize: 88, fontFamily: "Inter, sans-serif", fontWeight: 600, lineHeight: 1, color: "rgb(var(--c-accent) / 0.12)" }}>の</span>

                {/* Minimal actions */}
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
            )}
          </div>

          {/* Always mounted — CSS hide preserves PTY sessions */}
          <Terminal visible={showTerminal} />
        </div>

        {showGitPanel && <GitPanel />}
      </div>

      <StatusBar />

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
