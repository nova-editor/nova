import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface Preset {
  name:     string;
  settings: Settings;
}

export interface Settings {
  editor: {
    fontSize:        number;
    fontFamily:      string;
    tabSize:         number;
    lineWrap:        boolean;
    relativeNumbers: boolean;
    vimEnabled:      boolean;
    bracketMatch:    boolean;
    autocomplete:    boolean;
    indentLines:     boolean;
    theme:           string;
  };
  terminal: {
    fontSize:   number;
    lineHeight: number;
    scrollback: number;
  };
  background: {
    imagePath: string;   // absolute path; empty = none
    enabled:   boolean;  // quick toggle without losing the path
    opacity:   number;   // 0.0 – 1.0
    blur:      number;   // px blur, 0 = none
    tint:      number;   // 0.0 – 1.0 extra dark overlay over the image
  };
  fullDark:           boolean; // all backgrounds → near-black; fg/accent stay per-theme
  spotifyTransparent: boolean; // glass spotify player (shows wallpaper through)
  autosaveDelay:  number;
  sidebarWidth:   number;
}

export const DEFAULT_BACKGROUND = {
  imagePath: "",
  enabled:   true,
  opacity:   0.15,
  blur:      0,
  tint:      0.6,
};

export const DEFAULT_SETTINGS: Settings = {
  editor: {
    fontSize:        13,
    fontFamily:      "JetBrains Mono",
    tabSize:         4,
    lineWrap:        true,
    relativeNumbers: true,
    vimEnabled:      true,
    bracketMatch:    true,
    autocomplete:    true,
    indentLines:     true,
    theme:           "atomDark",
  },
  terminal: {
    fontSize:   13,
    lineHeight: 1.2,
    scrollback: 5000,
  },
  background: { ...DEFAULT_BACKGROUND },
  fullDark:           false,
  spotifyTransparent: false,
  autosaveDelay: 500,
  sidebarWidth:  240,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("nova-settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        editor:     { ...DEFAULT_SETTINGS.editor,     ...(parsed.editor     ?? {}) },
        terminal:   { ...DEFAULT_SETTINGS.terminal,   ...(parsed.terminal   ?? {}) },
        background: { ...DEFAULT_SETTINGS.background, ...(parsed.background ?? {}) },
        fullDark:   parsed.fullDark ?? DEFAULT_SETTINGS.fullDark,
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

// ── AI provider type ──────────────────────────────────────────────────────────
export type AiProvider = "claude" | "gemini" | "codex";

// ── FileTab — content lives in tabContentMap for O(1) keystroke perf ─────────
export interface FileTab {
  path:        string;
  name:        string;
  dirty:       boolean;
  language:    string;
  kind?:       "file" | "ai" | "ai-launcher" | "pinned-terminal";
  aiProvider?: AiProvider;
}

/** @deprecated Use AI_TAB_PREFIX + openAiTab instead */
export const CLAUDE_TAB_PATH   = "__claude__";
export const AI_TAB_PREFIX     = "__ai__";
export const AI_LAUNCHER_PATH  = "__ai-launcher__";

// ── PaneState — each pane has its own independent tab list ───────────────────
export interface PaneState {
  tabs:      FileTab[];
  activeIdx: number;
}

export interface FileEntry {
  name:   string;
  path:   string;
  is_dir: boolean;
  size:   number;
}

export interface GitFileStatus {
  path:   string;
  kind:   string;
  staged: boolean;
}

export interface GitBranchInfo {
  name:       string;
  is_current: boolean;
  upstream:   string | null;
}

interface GitState {
  branch:   string;
  status:   GitFileStatus[];
  branches: GitBranchInfo[];
}

interface AppState {
  // ── Workspace ───────────────────────────────────────────────────────────
  workspaceRoot:    string;
  setWorkspaceRoot: (root: string) => void;
  initCwd:          (root: string) => void;

  // ── Two-pane model ───────────────────────────────────────────────────────
  leftPane:     PaneState;
  rightPane:    PaneState | null;
  focusedPane:  "left" | "right";

  openFile:          (path: string) => Promise<void>;
  openAiTab:         (provider: AiProvider) => void;
  openAiLauncher:    () => void;
  openPinnedTerminal:   () => void;
  replaceTabWithAi:  (tabPath: string, provider: AiProvider) => void;
  closeTab:    (idx: number, pane: "left" | "right") => void;
  setActiveTab:   (idx: number, pane: "left" | "right") => void;
  setFocusedPane: (pane: "left" | "right") => void;
  splitEditor:    () => void;
  closeSplit:     () => void;
  saveTab:        (path: string, opts?: { silent?: boolean }) => Promise<void>;
  markDirty:      (path: string) => void;

  // ── Panels ──────────────────────────────────────────────────────────────
  showFileTree:   boolean;
  showTerminal:   boolean;
  showGitPanel:   boolean;
  toggleFileTree: () => void;
  toggleTerminal: () => void;
  toggleGitPanel: () => void;

  // ── File tree ───────────────────────────────────────────────────────────
  expandedDirs: Set<string>;
  toggleDir:    (path: string) => void;

  // ── Git ─────────────────────────────────────────────────────────────────
  gitBranch:     string;
  gitStatus:     GitFileStatus[];
  gitBranches:   GitBranchInfo[];
  refreshGit:    () => Promise<void>;
  stageFile:     (path: string) => Promise<void>;
  unstageFile:   (path: string) => Promise<void>;
  discardFile:   (path: string) => Promise<void>;
  commitFiles:   (message: string) => Promise<void>;
  checkoutBranch:(branch: string) => Promise<void>;

  // ── Status message ──────────────────────────────────────────────────────
  statusMsg: string;
  setStatus: (msg: string) => void;

  // ── Vim mode ─────────────────────────────────────────────────────────────
  vimMode:    "normal" | "insert";
  setVimMode: (mode: "normal" | "insert") => void;

  // ── Autosave ─────────────────────────────────────────────────────────────
  autosave:    boolean;
  setAutosave: (v: boolean) => void;

  // ── Help ─────────────────────────────────────────────────────────────────
  showHelp:   boolean;
  toggleHelp: () => void;

  // ── Overlays ────────────────────────────────────────────────────────────
  fuzzyOpen:      boolean;
  paletteOpen:    boolean;
  setFuzzyOpen:   (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;

  // ── Settings ─────────────────────────────────────────────────────────────
  settings:       Settings;
  updateSettings: (patch: {
    editor?:             Partial<Settings["editor"]>;
    terminal?:           Partial<Settings["terminal"]>;
    background?:         Partial<Settings["background"]>;
    fullDark?:           boolean;
    spotifyTransparent?: boolean;
    autosaveDelay?:      number;
    sidebarWidth?:       number;
  }) => void;
  showSettings:   boolean;
  toggleSettings: () => void;

  // ── Presets ───────────────────────────────────────────────────────────────
  presets:        (Preset | null)[];
  activePresetIdx: number | null;
  savePreset:     (idx: number, name: string) => void;
  loadPreset:     (idx: number) => void;
  deletePreset:   (idx: number) => void;
  cyclePreset:    () => void;

  // ── Spotify ───────────────────────────────────────────────────────────────
  showSpotify:   boolean;
  toggleSpotify: () => void;

  // ── Git panel width ────────────────────────────────────────────────────────
  gitPanelWidth:    number;
  setGitPanelWidth: (w: number) => void;

  // ── Terminal height (for Spotify tile reactive positioning) ───────────────
  terminalHeight:    number;
  setTerminalHeight: (h: number) => void;

  // ── Cursor position (for status bar LOC) ─────────────────────────────────
  cursorLine: number;
  cursorCol:  number;
  setCursor:  (line: number, col: number) => void;

}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", go: "go",
    json: "json", md: "markdown",
    html: "html", css: "css",
    sql: "sql", java: "java",
    cpp: "cpp", c: "cpp", h: "cpp",
    sh: "shell", bash: "shell",
    toml: "toml", yaml: "yaml", yml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

// ── Content store outside React — zero re-renders on keystrokes ───────────────
// Keyed by absolute file path. Set by Editor on every doc change.
// Read by saveTab. Cleared on closeTab when no pane holds the path.
export const tabContentMap = new Map<string, string>();

// ── Autosave timers keyed by file path ───────────────────────────────────────
const _autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Helpers ──────────────────────────────────────────────────────────────────
function getFocusedPane(s: Pick<AppState, "focusedPane" | "leftPane" | "rightPane">): {
  pane: PaneState;
  key: "left" | "right";
} {
  if (s.focusedPane === "right" && s.rightPane !== null) {
    return { pane: s.rightPane, key: "right" };
  }
  return { pane: s.leftPane, key: "left" };
}

export const useStore = create<AppState>((set, get) => ({
  // ── Workspace ─────────────────────────────────────────────────────────
  workspaceRoot: "",
  setWorkspaceRoot: (root) => {
    set({
      workspaceRoot: root,
      leftPane:      { tabs: [], activeIdx: 0 },
      rightPane:     null,
      focusedPane:   "left",
      expandedDirs:  new Set(),
      showFileTree:  true,
    });
    get().refreshGit();
  },
  initCwd: (root) => {
    set({ workspaceRoot: root });
  },

  // ── Two-pane model ────────────────────────────────────────────────────
  leftPane:    { tabs: [], activeIdx: 0 },
  rightPane:   null,
  focusedPane: "left",

  setFocusedPane: (pane) => set({ focusedPane: pane }),

  setActiveTab: (idx, pane) => set((s) => {
    if (pane === "left") return { leftPane: { ...s.leftPane, activeIdx: idx }, focusedPane: "left" };
    if (!s.rightPane) return {};
    return { rightPane: { ...s.rightPane, activeIdx: idx }, focusedPane: "right" };
  }),

  openFile: async (path) => {
    const { leftPane, rightPane, focusedPane } = get();
    const { pane, key } = getFocusedPane({ focusedPane, leftPane, rightPane });

    // Already in this pane — surface it
    const existing = pane.tabs.findIndex((t) => t.path === path);
    if (existing >= 0) {
      if (key === "left") set({ leftPane: { ...leftPane, activeIdx: existing }, focusedPane: "left" });
      else set({ rightPane: { ...rightPane!, activeIdx: existing }, focusedPane: "right" });
      return;
    }

    try {
      // Always read from disk — external tools (Claude, etc.) may have changed the file
      const content = await invoke<string>("read_file", { path });
      tabContentMap.set(path, content);
      const name    = path.split("/").pop() ?? path;
      const newTab: FileTab = { path, name, dirty: false, language: detectLanguage(path) };

      set((s) => {
        if (key === "left") {
          return {
            leftPane: { tabs: [...s.leftPane.tabs, newTab], activeIdx: s.leftPane.tabs.length },
            focusedPane: "left" as const,
          };
        }
        if (!s.rightPane) {
          return {
            rightPane: { tabs: [newTab], activeIdx: 0 },
            focusedPane: "right" as const,
          };
        }
        return {
          rightPane: { tabs: [...s.rightPane.tabs, newTab], activeIdx: s.rightPane.tabs.length },
          focusedPane: "right" as const,
        };
      });
    } catch (e) {
      get().setStatus(`Cannot open: ${e}`);
    }
  },

  openAiTab: (provider) => {
    const { leftPane, rightPane, focusedPane } = get();
    const { key } = getFocusedPane({ focusedPane, leftPane, rightPane });

    // Create a new unique session — multiple AI tabs per pane are allowed
    const sessionId = crypto.randomUUID();
    const path = `${AI_TAB_PREFIX}${provider}__${sessionId}`;
    const providerName = ({ claude: "Claude Code", gemini: "Gemini", codex: "Codex" } as const)[provider];
    const newTab: FileTab = { path, name: providerName, dirty: false, language: "plaintext", kind: "ai", aiProvider: provider };

    set((s) => {
      if (key === "left") {
        return { leftPane: { tabs: [...s.leftPane.tabs, newTab], activeIdx: s.leftPane.tabs.length }, focusedPane: "left" as const };
      }
      if (!s.rightPane) {
        return { rightPane: { tabs: [newTab], activeIdx: 0 }, focusedPane: "right" as const };
      }
      return { rightPane: { tabs: [...s.rightPane.tabs, newTab], activeIdx: s.rightPane.tabs.length }, focusedPane: "right" as const };
    });
  },

  openAiLauncher: () => {
    const { leftPane, rightPane, focusedPane } = get();
    const { key } = getFocusedPane({ focusedPane, leftPane, rightPane });
    const launcherId = crypto.randomUUID();
    const newTab: FileTab = {
      path:     `${AI_LAUNCHER_PATH}${launcherId}`,
      name:     "AI Agents",
      dirty:    false,
      language: "plaintext",
      kind:     "ai-launcher",
    };
    set((s) => {
      if (key === "left") {
        return { leftPane: { tabs: [...s.leftPane.tabs, newTab], activeIdx: s.leftPane.tabs.length }, focusedPane: "left" as const };
      }
      if (!s.rightPane) {
        return { rightPane: { tabs: [newTab], activeIdx: 0 }, focusedPane: "right" as const };
      }
      return { rightPane: { tabs: [...s.rightPane.tabs, newTab], activeIdx: s.rightPane.tabs.length }, focusedPane: "right" as const };
    });
  },

  openPinnedTerminal: () => {
    const { leftPane, rightPane, focusedPane } = get();
    const { key } = getFocusedPane({ focusedPane, leftPane, rightPane });
    const newTab: FileTab = {
      path:     `__pinned-terminal__${crypto.randomUUID()}`,
      name:     "Terminal",
      dirty:    false,
      language: "plaintext",
      kind:     "pinned-terminal",
    };
    set((s) => {
      if (key === "left") {
        return { leftPane: { tabs: [...s.leftPane.tabs, newTab], activeIdx: s.leftPane.tabs.length }, focusedPane: "left" as const };
      }
      if (!s.rightPane) {
        return { rightPane: { tabs: [newTab], activeIdx: 0 }, focusedPane: "right" as const };
      }
      return { rightPane: { tabs: [...s.rightPane.tabs, newTab], activeIdx: s.rightPane.tabs.length }, focusedPane: "right" as const };
    });
  },

  replaceTabWithAi: (tabPath, provider) => {
    const sessionId = crypto.randomUUID();
    const newTab: FileTab = {
      path:        `${AI_TAB_PREFIX}${provider}__${sessionId}`,
      name:        provider === "claude" ? "Claude Code" : provider === "gemini" ? "Gemini" : "Codex",
      dirty:       false,
      language:    "plaintext",
      kind:        "ai",
      aiProvider:  provider,
    };
    set((s) => {
      // Find which pane holds this launcher tab
      const leftIdx = s.leftPane.tabs.findIndex((t) => t.path === tabPath);
      if (leftIdx >= 0) {
        const tabs = s.leftPane.tabs.map((t, i) => i === leftIdx ? newTab : t);
        return { leftPane: { tabs, activeIdx: leftIdx }, focusedPane: "left" as const };
      }
      if (s.rightPane) {
        const rightIdx = s.rightPane.tabs.findIndex((t) => t.path === tabPath);
        if (rightIdx >= 0) {
          const tabs = s.rightPane.tabs.map((t, i) => i === rightIdx ? newTab : t);
          return { rightPane: { tabs, activeIdx: rightIdx }, focusedPane: "right" as const };
        }
      }
      return {};
    });
  },

  // Duplicate focused pane's active tab into the other pane.
  // Creates right pane if it doesn't exist. Focuses the destination pane.
  splitEditor: () => {
    const { focusedPane, leftPane, rightPane } = get();
    const { pane: srcPane, key: srcKey } = getFocusedPane({ focusedPane, leftPane, rightPane });
    const activeTab = srcPane.tabs[srcPane.activeIdx];
    if (!activeTab) return;

    const destKey: "left" | "right" = srcKey === "left" ? "right" : "left";

    set((s) => {
      if (destKey === "right") {
        if (!s.rightPane) {
          return { rightPane: { tabs: [activeTab], activeIdx: 0 }, focusedPane: "right" as const };
        }
        const existIdx = s.rightPane.tabs.findIndex((t) => t.path === activeTab.path);
        if (existIdx >= 0) {
          return { rightPane: { ...s.rightPane, activeIdx: existIdx }, focusedPane: "right" as const };
        }
        return {
          rightPane: { tabs: [...s.rightPane.tabs, activeTab], activeIdx: s.rightPane.tabs.length },
          focusedPane: "right" as const,
        };
      } else {
        // dest is left
        const existIdx = s.leftPane.tabs.findIndex((t) => t.path === activeTab.path);
        if (existIdx >= 0) {
          return { leftPane: { ...s.leftPane, activeIdx: existIdx }, focusedPane: "left" as const };
        }
        return {
          leftPane: { tabs: [...s.leftPane.tabs, activeTab], activeIdx: s.leftPane.tabs.length },
          focusedPane: "left" as const,
        };
      }
    });
  },

  closeSplit: () => {
    set({ rightPane: null, focusedPane: "left" });
  },

  closeTab: (idx, pane) => {
    const { leftPane, rightPane } = get();
    const sourcePane = pane === "left" ? leftPane : rightPane;
    if (!sourcePane) return;

    const tab = sourcePane.tabs[idx];
    if (tab) {
      // Only free content/timers if path won't remain open in any pane
      const remainLeft  = pane === "left" ? leftPane.tabs.filter((_, i) => i !== idx)  : leftPane.tabs;
      const remainRight = pane === "right" ? (rightPane?.tabs ?? []).filter((_, i) => i !== idx) : (rightPane?.tabs ?? []);
      const stillOpen   = remainLeft.some((t) => t.path === tab.path) || remainRight.some((t) => t.path === tab.path);
      if (!stillOpen) {
        const timer = _autosaveTimers.get(tab.path);
        if (timer) { clearTimeout(timer); _autosaveTimers.delete(tab.path); }
        tabContentMap.delete(tab.path);
      }
    }

    set((s) => {
      if (pane === "left") {
        const tabs      = s.leftPane.tabs.filter((_, i) => i !== idx);
        const activeIdx = Math.min(s.leftPane.activeIdx, Math.max(0, tabs.length - 1));
        return { leftPane: { tabs, activeIdx } };
      } else {
        if (!s.rightPane) return {};
        const tabs = s.rightPane.tabs.filter((_, i) => i !== idx);
        if (tabs.length === 0) return { rightPane: null, focusedPane: "left" as const };
        const activeIdx = Math.min(s.rightPane.activeIdx, Math.max(0, tabs.length - 1));
        return { rightPane: { tabs, activeIdx } };
      }
    });
  },

  saveTab: async (path, { silent = false } = {}) => {
    const { leftPane, rightPane } = get();
    const tab = leftPane.tabs.find((t) => t.path === path)
      ?? rightPane?.tabs.find((t) => t.path === path);
    if (!tab || !tab.dirty || tab.kind === "ai" || tab.kind === "ai-launcher" || tab.kind === "pinned-terminal") return;

    const content = tabContentMap.get(tab.path) ?? "";
    try {
      await invoke("write_file", { path: tab.path, content });
      // Clear dirty in ALL panes that have this path
      set((s) => ({
        leftPane: {
          ...s.leftPane,
          tabs: s.leftPane.tabs.map((t) => t.path === path ? { ...t, dirty: false } : t),
        },
        rightPane: s.rightPane ? {
          ...s.rightPane,
          tabs: s.rightPane.tabs.map((t) => t.path === path ? { ...t, dirty: false } : t),
        } : null,
      }));
      if (!silent) {
        get().setStatus(`Saved ${tab.name}`);
        get().refreshGit();
      }
    } catch (e) {
      get().setStatus(`Save failed: ${e}`);
    }
  },

  // Called by Editor on every doc change. Marks dirty in ALL panes holding the path.
  markDirty: (path) => {
    const { leftPane, rightPane, autosave, settings } = get();
    const inLeft  = leftPane.tabs.some((t) => t.path === path);
    const inRight = rightPane?.tabs.some((t) => t.path === path) ?? false;
    if (!inLeft && !inRight) return;

    const alreadyDirty = leftPane.tabs.find((t) => t.path === path)?.dirty
      || rightPane?.tabs.find((t) => t.path === path)?.dirty;

    if (!alreadyDirty) {
      set((s) => ({
        leftPane: {
          ...s.leftPane,
          tabs: s.leftPane.tabs.map((t) => t.path === path ? { ...t, dirty: true } : t),
        },
        rightPane: s.rightPane ? {
          ...s.rightPane,
          tabs: s.rightPane.tabs.map((t) => t.path === path ? { ...t, dirty: true } : t),
        } : null,
      }));
    }

    if (autosave) {
      const prev = _autosaveTimers.get(path);
      if (prev) clearTimeout(prev);
      _autosaveTimers.set(path, setTimeout(() => {
        _autosaveTimers.delete(path);
        get().saveTab(path, { silent: true });
      }, settings.autosaveDelay));
    }
  },

  // ── Panels ────────────────────────────────────────────────────────────
  showFileTree:  false,
  showTerminal:  false,
  showGitPanel:  false,
  toggleFileTree: () => set((s) => ({ showFileTree: !s.showFileTree })),
  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  toggleGitPanel: () => set((s) => ({ showGitPanel: !s.showGitPanel })),

  // ── File tree ─────────────────────────────────────────────────────────
  expandedDirs: new Set(),
  toggleDir: (path) => set((s) => {
    const next = new Set(s.expandedDirs);
    if (next.has(path)) next.delete(path); else next.add(path);
    return { expandedDirs: next };
  }),

  // ── Git ───────────────────────────────────────────────────────────────
  gitBranch:   "",
  gitStatus:   [],
  gitBranches: [],

  refreshGit: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    try {
      const state = await invoke<GitState>("git_state", { repoPath: workspaceRoot });
      set({ gitBranch: state.branch, gitStatus: state.status, gitBranches: state.branches });
    } catch { /* not a git repo */ }
  },

  stageFile: async (path) => {
    const { workspaceRoot } = get();
    await invoke("git_stage", { repoPath: workspaceRoot, filePath: path });
    get().refreshGit();
  },

  unstageFile: async (path) => {
    const { workspaceRoot } = get();
    await invoke("git_unstage", { repoPath: workspaceRoot, filePath: path });
    get().refreshGit();
  },

  discardFile: async (path) => {
    const { workspaceRoot } = get();
    try {
      await invoke("git_discard", { repoPath: workspaceRoot, filePath: path });
      const { leftPane, rightPane } = get();
      const allTabs = [...leftPane.tabs, ...(rightPane?.tabs ?? [])];
      const tab = allTabs.find((t) => t.path === path || t.path === `${workspaceRoot}/${path}`);
      if (tab) {
        const content = await invoke<string>("read_file", { path: tab.path });
        tabContentMap.set(tab.path, content);
        const p = tab.path;
        set((s) => ({
          leftPane: {
            ...s.leftPane,
            tabs: s.leftPane.tabs.map((t) => t.path === p ? { ...t, dirty: false } : t),
          },
          rightPane: s.rightPane ? {
            ...s.rightPane,
            tabs: s.rightPane.tabs.map((t) => t.path === p ? { ...t, dirty: false } : t),
          } : null,
        }));
      }
      get().refreshGit();
    } catch (e) {
      get().setStatus(`Discard failed: ${e}`);
    }
  },

  commitFiles: async (message) => {
    const { workspaceRoot } = get();
    try {
      const oid = await invoke<string>("git_commit", { repoPath: workspaceRoot, message });
      get().setStatus(`Committed ${oid}`);
      get().refreshGit();
    } catch (e) {
      get().setStatus(`Commit failed: ${e}`);
    }
  },

  checkoutBranch: async (branch) => {
    const { workspaceRoot } = get();
    try {
      await invoke("git_checkout", { repoPath: workspaceRoot, branch });
      get().refreshGit();
      window.dispatchEvent(new CustomEvent("nova:refresh-dir", { detail: workspaceRoot }));
    } catch (e) {
      get().setStatus(`Checkout failed: ${e}`);
    }
  },

  // ── Status ────────────────────────────────────────────────────────────
  statusMsg: "Ready",
  setStatus: (msg) => {
    set({ statusMsg: msg });
    setTimeout(() => set((s) => ({ statusMsg: s.statusMsg === msg ? "Ready" : s.statusMsg })), 4000);
  },

  // ── Vim mode ──────────────────────────────────────────────────────────
  vimMode:    "normal",
  setVimMode: (mode) => set({ vimMode: mode }),

  // ── Autosave ──────────────────────────────────────────────────────────
  autosave:    true,
  setAutosave: (v) => set({ autosave: v }),

  // ── Help ──────────────────────────────────────────────────────────────
  showHelp:   false,
  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),

  // ── Overlays ──────────────────────────────────────────────────────────
  fuzzyOpen:      false,
  paletteOpen:    false,
  setFuzzyOpen:   (v) => set({ fuzzyOpen: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),

  // ── Settings ──────────────────────────────────────────────────────────
  settings:       loadSettings(),
  showSettings:   false,
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  updateSettings: (patch) => {
    set((s) => {
      const next: Settings = {
        ...s.settings,
        ...patch,
        editor:     { ...s.settings.editor,     ...(patch.editor     ?? {}) },
        terminal:   { ...s.settings.terminal,   ...(patch.terminal   ?? {}) },
        background: { ...s.settings.background, ...(patch.background ?? {}) },
      };
      localStorage.setItem("nova-settings", JSON.stringify(next));
      return { settings: next };
    });
  },

  // ── Spotify ───────────────────────────────────────────────────────────
  showSpotify:   false,
  toggleSpotify: () => set((s) => ({ showSpotify: !s.showSpotify })),


  // ── Git panel width ────────────────────────────────────────────────────
  gitPanelWidth:    280,
  setGitPanelWidth: (w) => set({ gitPanelWidth: w }),

  // ── Terminal height ───────────────────────────────────────────────────
  terminalHeight:    260,
  setTerminalHeight: (h) => set({ terminalHeight: h }),

  // ── Cursor position ───────────────────────────────────────────────────
  cursorLine: 1,
  cursorCol:  1,
  setCursor:  (line, col) => set({ cursorLine: line, cursorCol: col }),

  // ── Presets ───────────────────────────────────────────────────────────
  presets: (() => {
    try {
      const raw = localStorage.getItem("nova-presets");
      if (raw) {
        const parsed = JSON.parse(raw) as (Preset | null)[];
        if (Array.isArray(parsed) && parsed.length === 5) return parsed;
      }
    } catch { /* ignore */ }
    return [null, null, null, null, null];
  })(),
  activePresetIdx: (() => {
    const raw = localStorage.getItem("nova-active-preset");
    return raw !== null ? Number(raw) : null;
  })(),

  savePreset: (idx, name) => {
    set((s) => {
      const presets = [...s.presets] as (Preset | null)[];
      presets[idx] = { name, settings: s.settings };
      localStorage.setItem("nova-presets", JSON.stringify(presets));
      localStorage.setItem("nova-active-preset", String(idx));
      return { presets, activePresetIdx: idx };
    });
  },

  loadPreset: (idx) => {
    const { presets } = get();
    const preset = presets[idx];
    if (!preset) return;
    set(() => {
      const next: Settings = {
        ...DEFAULT_SETTINGS,
        ...preset.settings,
        editor:     { ...DEFAULT_SETTINGS.editor,     ...(preset.settings.editor     ?? {}) },
        terminal:   { ...DEFAULT_SETTINGS.terminal,   ...(preset.settings.terminal   ?? {}) },
        background: { ...DEFAULT_SETTINGS.background, ...(preset.settings.background ?? {}) },
      };
      localStorage.setItem("nova-settings", JSON.stringify(next));
      localStorage.setItem("nova-active-preset", String(idx));
      return { settings: next, activePresetIdx: idx };
    });
    get().setStatus(`Preset "${preset.name}" loaded`);
  },

  deletePreset: (idx) => {
    set((s) => {
      const presets = [...s.presets] as (Preset | null)[];
      presets[idx] = null;
      localStorage.setItem("nova-presets", JSON.stringify(presets));
      const activePresetIdx = s.activePresetIdx === idx ? null : s.activePresetIdx;
      if (activePresetIdx === null) localStorage.removeItem("nova-active-preset");
      return { presets, activePresetIdx };
    });
  },

  cyclePreset: () => {
    const { presets, activePresetIdx, loadPreset, setStatus } = get();
    const filled = presets.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    if (filled.length === 0) { setStatus("No presets saved yet"); return; }
    const cur  = filled.indexOf(activePresetIdx ?? -1);
    const next = filled[(cur + 1) % filled.length];
    loadPreset(next);
  },
}));
