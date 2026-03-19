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
  autosaveDelay: number;
  sidebarWidth:  number;
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

// ── FileTab no longer stores content — content lives in tabContentMap ─────────
// This eliminates O(content_size) Zustand state updates on every keystroke.
export interface FileTab {
  path:     string;
  name:     string;
  dirty:    boolean;
  language: string;
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

  // ── Tabs / Buffers ──────────────────────────────────────────────────────
  tabs:         FileTab[];
  activeTabIdx: number;
  openFile:     (path: string) => Promise<void>;
  closeTab:     (idx: number) => void;
  setActiveTab: (idx: number) => void;
  saveTab:      (idx: number, opts?: { silent?: boolean }) => Promise<void>;
  markDirty:    (path: string) => void;

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
    editor?:            Partial<Settings["editor"]>;
    terminal?:          Partial<Settings["terminal"]>;
    background?:        Partial<Settings["background"]>;
    fullDark?:          boolean;
    spotifyTransparent?: boolean;
    autosaveDelay?:     number;
    sidebarWidth?:      number;
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

  // ── Git panel width (changes when graph tab is active) ────────────────────
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
// Read by saveTab. Cleared on closeTab.
export const tabContentMap = new Map<string, string>();

// ── Autosave timers keyed by FILE PATH (not index — index shifts on close) ────
const _autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useStore = create<AppState>((set, get) => ({
  // ── Workspace ─────────────────────────────────────────────────────────
  workspaceRoot: "",
  setWorkspaceRoot: (root) => {
    set({ workspaceRoot: root, tabs: [], activeTabIdx: 0, expandedDirs: new Set(), showFileTree: true });
    get().refreshGit();
  },
  // Set cwd for terminal default only — does not open file tree
  initCwd: (root) => {
    set({ workspaceRoot: root });
  },

  // ── Tabs ──────────────────────────────────────────────────────────────
  tabs:         [],
  activeTabIdx: 0,

  openFile: async (path) => {
    const { tabs } = get();
    const existing = tabs.findIndex((t) => t.path === path);
    if (existing >= 0) { set({ activeTabIdx: existing }); return; }
    try {
      const content = await invoke<string>("read_file", { path });
      tabContentMap.set(path, content);
      const name = path.split("/").pop() ?? path;
      set((s) => ({
        tabs:         [...s.tabs, { path, name, dirty: false, language: detectLanguage(path) }],
        activeTabIdx: s.tabs.length,
      }));
    } catch (e) {
      get().setStatus(`Cannot open: ${e}`);
    }
  },

  closeTab: (idx) => {
    const tab = get().tabs[idx];
    if (tab) {
      // Cancel pending autosave for this file
      const timer = _autosaveTimers.get(tab.path);
      if (timer) { clearTimeout(timer); _autosaveTimers.delete(tab.path); }
      // Free content memory
      tabContentMap.delete(tab.path);
    }
    set((s) => {
      const tabs         = s.tabs.filter((_, i) => i !== idx);
      const activeTabIdx = Math.min(s.activeTabIdx, Math.max(0, tabs.length - 1));
      return { tabs, activeTabIdx };
    });
  },

  setActiveTab: (idx) => set({ activeTabIdx: idx }),

  saveTab: async (idx, { silent = false } = {}) => {
    const tab = get().tabs[idx];
    if (!tab || !tab.dirty) return;
    const content = tabContentMap.get(tab.path) ?? "";
    try {
      await invoke("write_file", { path: tab.path, content });
      set((s) => ({
        tabs: s.tabs.map((t, i) => i === idx ? { ...t, dirty: false } : t),
      }));
      if (!silent) {
        get().setStatus(`Saved ${tab.name}`);
        get().refreshGit();
      }
    } catch (e) {
      get().setStatus(`Save failed: ${e}`);
    }
  },

  // Called by Editor on every doc change. Only updates Zustand when transitioning
  // clean → dirty (first keystroke after save). Subsequent keystrokes are O(1)
  // with no Zustand set() call — content is already in tabContentMap.
  markDirty: (path) => {
    const { tabs, autosave, settings } = get();
    const idx = tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;

    // Only write to Zustand on the clean→dirty transition
    if (!tabs[idx].dirty) {
      set((s) => ({
        tabs: s.tabs.map((t, i) => i === idx ? { ...t, dirty: true } : t),
      }));
    }

    // Always reschedule autosave debounce
    if (autosave) {
      const prev = _autosaveTimers.get(path);
      if (prev) clearTimeout(prev);
      _autosaveTimers.set(path, setTimeout(() => {
        _autosaveTimers.delete(path);
        // Re-resolve index at fire time — tab may have moved
        const currentIdx = get().tabs.findIndex((t) => t.path === path);
        if (currentIdx >= 0) get().saveTab(currentIdx, { silent: true });
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

  // Single IPC call + single open_repo instead of 3 parallel calls × 3 open_repo
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
      // Reload file content into any open tab
      const tabs = get().tabs;
      const idx  = tabs.findIndex((t) => t.path === `${workspaceRoot}/${path}` || t.path === path);
      if (idx >= 0) {
        const content = await invoke<string>("read_file", { path: tabs[idx].path });
        tabContentMap.set(tabs[idx].path, content);
        set((s) => ({
          tabs: s.tabs.map((t, i) => i === idx ? { ...t, dirty: false } : t),
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
      // Reload the file tree — branch switch changes which files exist
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

  // ── Terminal height (for Spotify tile reactive positioning) ───────────
  terminalHeight:    260,
  setTerminalHeight: (h) => set({ terminalHeight: h }),

  // ── Cursor position (for status bar LOC) ─────────────────────────────
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
    set((s) => {
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
    const cur = filled.indexOf(activePresetIdx ?? -1);
    const next = filled[(cur + 1) % filled.length];
    loadPreset(next);
  },
}));
