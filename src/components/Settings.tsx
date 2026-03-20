import { useRef, useEffect, useState } from "react";
import { X, ImageIcon, Trash2, Save, Play, RefreshCw, Download, CheckCircle, AlertCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore, Settings, DEFAULT_SETTINGS, DEFAULT_BACKGROUND } from "../store";
import { THEME_OPTIONS } from "../theme/themes";

type EditorPatch     = Partial<Settings["editor"]>;
type TerminalPatch   = Partial<Settings["terminal"]>;
type BackgroundPatch = Partial<Settings["background"]>;

// ── Reusable field components ─────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-editor-border/30">
      <span className="text-xs text-editor-comment">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-8 h-[18px] rounded-full transition-colors focus:outline-none
        ${value ? "bg-editor-accent" : "bg-editor-border"}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform
          ${value ? "translate-x-[14px]" : "translate-x-0"}`}
      />
    </button>
  );
}

function NumberInput({
  value, onChange, min, max, step = 1, suffix,
}: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-14 bg-editor-bg border border-editor-border rounded px-2 py-0.5 text-xs
                   text-editor-fg font-mono text-right focus:outline-none focus:border-editor-accent/60"
      />
      {suffix && <span className="text-2xs text-editor-comment w-4">{suffix}</span>}
    </div>
  );
}

function Select<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange((typeof value === "number" ? Number(raw) : raw) as T);
      }}
      className="bg-editor-bg border border-editor-border rounded px-2 py-0.5 text-xs
                 text-editor-fg focus:outline-none focus:border-editor-accent/60 cursor-pointer"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  );
}

function Slider({
  value, onChange, min, max, step = 0.01, suffix, decimals = 2,
}: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; decimals?: number }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        value={value}
        min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: "rgb(var(--c-accent))" }}
      />
      <span className="text-2xs text-editor-comment font-mono w-10 text-right">
        {value.toFixed(decimals)}{suffix}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-semibold tracking-[0.12em] uppercase text-editor-comment/60 mb-2 mt-1">
      {children}
    </p>
  );
}

// ── Update types ─────────────────────────────────────────────────────────────

type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "done" | "error";

interface UpdateInfo {
  version: string;
  current_version: string;
  body?: string;
  date?: string;
}

interface DownloadProgress {
  downloaded: number;
  total?: number;
}

// ── Updates section ───────────────────────────────────────────────────────────

function UpdatesSection() {
  const [appVersion, setAppVersion]           = useState<string>("…");
  const [updateState, setUpdateState]         = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo]           = useState<UpdateInfo | null>(null);
  const [progress, setProgress]               = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg]               = useState<string>("");

  useEffect(() => {
    invoke<string>("get_app_version").then(setAppVersion).catch(() => {});
  }, []);

  const checkForUpdates = async () => {
    setUpdateState("checking");
    setUpdateInfo(null);
    setProgress(null);
    setErrorMsg("");
    try {
      const info = await invoke<UpdateInfo | null>("check_update");
      if (info) {
        setUpdateInfo(info);
        setUpdateState("available");
      } else {
        setUpdateState("up-to-date");
      }
    } catch (e) {
      setErrorMsg(String(e));
      setUpdateState("error");
    }
  };

  const installUpdate = async () => {
    setUpdateState("downloading");
    setProgress({ downloaded: 0 });
    const unlisten = await listen<DownloadProgress>("update://progress", (ev) => {
      setProgress(ev.payload);
    });
    try {
      await invoke("install_update");
      setUpdateState("done");
    } catch (e) {
      setErrorMsg(String(e));
      setUpdateState("error");
    } finally {
      unlisten();
    }
  };

  const percent =
    progress && progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  const formatBytes = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div>
      <SectionLabel>Updates</SectionLabel>
      <div className="rounded-lg border border-editor-border/30 overflow-hidden">

        {/* Version row */}
        <div className="flex items-center justify-between gap-4 px-3 py-2.5 border-b border-editor-border/20">
          <span className="text-xs text-editor-comment">Current version</span>
          <span className="text-xs font-mono text-editor-fg">v{appVersion}</span>
        </div>

        {/* Status + action */}
        <div className="p-3 space-y-3">

          {/* idle / up-to-date / error — show check button */}
          {(updateState === "idle" || updateState === "up-to-date" || updateState === "error") && (
            <button
              onClick={checkForUpdates}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-editor-fg
                         bg-editor-bg border border-editor-border/60 hover:border-editor-accent/50
                         transition-colors w-full justify-center"
            >
              <RefreshCw size={11} />
              Check for updates
            </button>
          )}

          {/* checking spinner */}
          {updateState === "checking" && (
            <div className="flex items-center gap-2 justify-center py-1">
              <RefreshCw size={11} className="animate-spin text-editor-accent" />
              <span className="text-xs text-editor-comment">Checking…</span>
            </div>
          )}

          {/* up to date */}
          {updateState === "up-to-date" && (
            <div className="flex items-center gap-2 justify-center py-1">
              <CheckCircle size={11} className="text-green-400" />
              <span className="text-xs text-editor-comment">You're on the latest version</span>
            </div>
          )}

          {/* update available */}
          {(updateState === "available") && updateInfo && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Download size={11} className="text-editor-accent" />
                  <span className="text-xs text-editor-accent font-semibold">
                    v{updateInfo.version} available
                  </span>
                </div>
                {updateInfo.date && (
                  <span className="text-2xs text-editor-comment/60">
                    {new Date(updateInfo.date).toLocaleDateString()}
                  </span>
                )}
              </div>

              {updateInfo.body && (
                <div className="rounded-md bg-editor-bg/60 border border-editor-border/20 px-2.5 py-2 max-h-28 overflow-y-auto">
                  <pre className="text-2xs text-editor-comment whitespace-pre-wrap leading-relaxed font-mono">
                    {updateInfo.body}
                  </pre>
                </div>
              )}

              <button
                onClick={installUpdate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white
                           bg-editor-accent/80 hover:bg-editor-accent transition-colors w-full justify-center"
              >
                <Download size={11} />
                Install update
              </button>
            </div>
          )}

          {/* downloading progress */}
          {updateState === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Download size={11} className="text-editor-accent animate-bounce" />
                  <span className="text-xs text-editor-comment">Downloading…</span>
                </div>
                {progress && (
                  <span className="text-2xs font-mono text-editor-comment">
                    {formatBytes(progress.downloaded)}
                    {progress.total ? ` / ${formatBytes(progress.total)}` : ""}
                  </span>
                )}
              </div>
              <div className="w-full h-1 rounded-full bg-editor-border/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: percent !== null ? `${percent}%` : "30%",
                    background: "rgb(var(--c-accent))",
                    animation: percent === null ? "pulse 1s ease-in-out infinite" : undefined,
                  }}
                />
              </div>
              {percent !== null && (
                <p className="text-2xs text-editor-comment/60 text-right">{percent}%</p>
              )}
            </div>
          )}

          {/* done — app will relaunch */}
          {updateState === "done" && (
            <div className="flex items-center gap-2 justify-center py-1">
              <CheckCircle size={11} className="text-green-400" />
              <span className="text-xs text-editor-comment">Update installed — relaunching…</span>
            </div>
          )}

          {/* error */}
          {updateState === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-red-500/8 border border-red-500/20 px-2.5 py-2">
              <AlertCircle size={11} className="text-red-400 mt-0.5 shrink-0" />
              <span className="text-2xs text-red-400 leading-relaxed break-all">{errorMsg}</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Main Settings panel ───────────────────────────────────────────────────────

export function SettingsPanel() {
  const settings       = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const autosave       = useStore((s) => s.autosave);
  const setAutosave    = useStore((s) => s.setAutosave);
  const presets        = useStore((s) => s.presets);
  const activePresetIdx = useStore((s) => s.activePresetIdx);
  const savePreset     = useStore((s) => s.savePreset);
  const loadPreset     = useStore((s) => s.loadPreset);
  const deletePreset   = useStore((s) => s.deletePreset);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftName, setDraftName]   = useState("");
  const panelRef       = useRef<HTMLDivElement>(null);

  const e  = (patch: EditorPatch)     => updateSettings({ editor:     patch });
  const t  = (patch: TerminalPatch)   => updateSettings({ terminal:   patch });
  const b  = (patch: BackgroundPatch) => updateSettings({ background: patch });

  const pickBgImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }],
      });
      if (typeof selected === "string") b({ imagePath: selected });
    } catch { /* cancelled */ }
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") toggleSettings(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSettings]);

  const FONTS = [
    { label: "JetBrains Mono",  value: "JetBrains Mono"  },
    { label: "Fira Code",       value: "Fira Code"        },
    { label: "Cascadia Code",   value: "Cascadia Code"    },
    { label: "Source Code Pro", value: "Source Code Pro"  },
    { label: "Menlo",           value: "Menlo"            },
    { label: "Monaco",          value: "Monaco"           },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={toggleSettings} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-10 right-3 z-50 w-[300px] max-h-[88vh] flex flex-col
                   border border-editor-border/70 rounded-xl shadow-2xl
                   overflow-hidden fade-in"
        style={{ background: "rgb(var(--c-sidebar) / 0.96)", backdropFilter: "blur(32px) saturate(1.8)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border/40 shrink-0">
          <span className="text-xs font-semibold text-editor-fg tracking-wide">Settings</span>
          <button onClick={toggleSettings} className="text-editor-comment hover:text-editor-fg transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* ── Editor ── */}
          <div>
            <SectionLabel>Editor</SectionLabel>
            <div className="rounded-lg overflow-hidden border border-editor-border/30">
              <Row label="Theme">
                <Select
                  value={settings.editor.theme}
                  options={THEME_OPTIONS}
                  onChange={(v) => e({ theme: v })}
                />
              </Row>
              <Row label="Font">
                <Select
                  value={settings.editor.fontFamily}
                  options={FONTS}
                  onChange={(v) => e({ fontFamily: v })}
                />
              </Row>
              <Row label="Font size">
                <NumberInput value={settings.editor.fontSize} min={10} max={22} suffix="px"
                  onChange={(v) => e({ fontSize: v })} />
              </Row>
              <Row label="Tab size">
                <Select
                  value={settings.editor.tabSize}
                  options={[
                    { label: "2", value: 2 },
                    { label: "4", value: 4 },
                    { label: "8", value: 8 },
                  ]}
                  onChange={(v) => e({ tabSize: v })}
                />
              </Row>
              <Row label="Word wrap">
                <Toggle value={settings.editor.lineWrap} onChange={(v) => e({ lineWrap: v })} />
              </Row>
              <Row label="Relative numbers">
                <Toggle value={settings.editor.relativeNumbers} onChange={(v) => e({ relativeNumbers: v })} />
              </Row>
              <Row label="Vim mode">
                <Toggle value={settings.editor.vimEnabled} onChange={(v) => e({ vimEnabled: v })} />
              </Row>
              <Row label="Bracket matching">
                <Toggle value={settings.editor.bracketMatch} onChange={(v) => e({ bracketMatch: v })} />
              </Row>
              <Row label="Indent lines">
                <Toggle value={settings.editor.indentLines} onChange={(v) => e({ indentLines: v })} />
              </Row>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-editor-comment">Autocomplete</span>
                <Toggle value={settings.editor.autocomplete} onChange={(v) => e({ autocomplete: v })} />
              </div>
            </div>
          </div>

          {/* ── Autosave ── */}
          <div>
            <SectionLabel>Autosave</SectionLabel>
            <div className="rounded-lg overflow-hidden border border-editor-border/30">
              <Row label="Enabled">
                <Toggle value={autosave} onChange={setAutosave} />
              </Row>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-editor-comment">Delay</span>
                <Select
                  value={settings.autosaveDelay}
                  options={[
                    { label: "300 ms",  value: 300  },
                    { label: "500 ms",  value: 500  },
                    { label: "1 s",     value: 1000 },
                    { label: "2 s",     value: 2000 },
                    { label: "5 s",     value: 5000 },
                  ]}
                  onChange={(v) => updateSettings({ autosaveDelay: v })}
                />
              </div>
            </div>
          </div>

          {/* ── Terminal ── */}
          <div>
            <SectionLabel>Terminal</SectionLabel>
            <div className="rounded-lg overflow-hidden border border-editor-border/30">
              <Row label="Font size">
                <NumberInput value={settings.terminal.fontSize} min={10} max={20} suffix="px"
                  onChange={(v) => t({ fontSize: v })} />
              </Row>
              <Row label="Line height">
                <NumberInput value={settings.terminal.lineHeight} min={1.0} max={2.0} step={0.1}
                  onChange={(v) => t({ lineHeight: parseFloat(v.toFixed(1)) })} />
              </Row>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-editor-comment">Scrollback</span>
                <Select
                  value={settings.terminal.scrollback}
                  options={[
                    { label: "1 000",  value: 1000  },
                    { label: "5 000",  value: 5000  },
                    { label: "10 000", value: 10000 },
                    { label: "50 000", value: 50000 },
                  ]}
                  onChange={(v) => t({ scrollback: v })}
                />
              </div>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div>
            <SectionLabel>Appearance</SectionLabel>
            <div className="rounded-lg overflow-hidden border border-editor-border/30">
              <Row label="Full dark">
                <Toggle
                  value={settings.fullDark}
                  onChange={(v) => updateSettings({ fullDark: v })}
                />
              </Row>
              <Row label="Transparent Spotify">
                <Toggle
                  value={settings.spotifyTransparent}
                  onChange={(v) => updateSettings({ spotifyTransparent: v })}
                />
              </Row>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-editor-comment">Sidebar width</span>
                <NumberInput value={settings.sidebarWidth} min={160} max={500} suffix="px"
                  onChange={(v) => updateSettings({ sidebarWidth: v })} />
              </div>
            </div>
          </div>

          {/* ── Background ── */}
          <div>
            <div className="flex items-center justify-between mb-2 mt-1">
              <p className="text-2xs font-semibold tracking-[0.12em] uppercase text-editor-comment/60">
                Background image
              </p>
              {settings.background.imagePath && (
                <Toggle
                  value={settings.background.enabled}
                  onChange={(v) => b({ enabled: v })}
                />
              )}
            </div>
            <div className="rounded-lg overflow-hidden border border-editor-border/30 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={pickBgImage}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-editor-fg bg-editor-bg border border-editor-border/60 hover:border-editor-accent/40 transition-colors"
                >
                  <ImageIcon size={11} />
                  {settings.background.imagePath ? "Change" : "Pick image…"}
                </button>
                {settings.background.imagePath && (
                  <button
                    onClick={() => b({ imagePath: "" })}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove background"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                {settings.background.imagePath && (
                  <span className="text-2xs text-editor-comment truncate flex-1" title={settings.background.imagePath}>
                    {settings.background.imagePath.split("/").pop()}
                  </span>
                )}
              </div>

              {settings.background.imagePath && (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-2xs text-editor-comment">Opacity</span>
                    </div>
                    <Slider
                      value={settings.background.opacity}
                      onChange={(v) => b({ opacity: v })}
                      min={0.01} max={1} step={0.01}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-2xs text-editor-comment">Dark tint</span>
                    </div>
                    <Slider
                      value={settings.background.tint}
                      onChange={(v) => b({ tint: v })}
                      min={0} max={0.98} step={0.01}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-2xs text-editor-comment">Blur</span>
                    </div>
                    <Slider
                      value={settings.background.blur}
                      onChange={(v) => b({ blur: Math.round(v) })}
                      min={0} max={40} step={1} decimals={0} suffix="px"
                    />
                  </div>
                  <button
                    onClick={() => b({ ...DEFAULT_BACKGROUND, imagePath: settings.background.imagePath })}
                    className="text-2xs text-editor-comment hover:text-editor-fg transition-colors"
                  >
                    reset sliders
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── AI ── */}
          <div>
            <SectionLabel>AI</SectionLabel>
            <div className="rounded-lg overflow-hidden border border-editor-border/30">
              <div className="flex flex-col gap-1 py-2.5 px-0 border-b border-editor-border/30">
                <div className="flex items-center justify-between gap-4 px-0">
                  <span className="text-xs text-editor-comment">Anthropic API Key</span>
                </div>
                <input
                  type="password"
                  value={settings.claudeApiKey ?? ""}
                  onChange={(e) => updateSettings({ claudeApiKey: e.target.value })}
                  placeholder="sk-ant-…"
                  className="w-full bg-transparent text-xs font-mono text-editor-fg outline-none placeholder-editor-comment/40 py-1"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
                <span className="text-2xs text-editor-comment/50" style={{ fontSize: 9 }}>
                  Used by Claude direct API chat (⌘⇧A). Stored locally only.
                </span>
              </div>
            </div>
          </div>

          {/* ── Updates ── */}
          <UpdatesSection />

          {/* ── Presets ── */}
          <div>
            <SectionLabel>Presets</SectionLabel>
            <div className="space-y-1.5">
              {Array.from({ length: 5 }, (_, i) => {
                const preset = presets[i];
                const isActive = activePresetIdx === i;
                const isEditing = editingIdx === i;

                return (
                  <div key={i}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors"
                    style={{
                      borderColor: isActive ? "rgb(var(--c-accent) / 0.5)" : "rgb(var(--c-border) / 0.3)",
                      background: isActive ? "rgb(var(--c-accent) / 0.07)" : "rgb(var(--c-bg) / 0.4)",
                    }}
                  >
                    <span className="text-2xs font-mono text-editor-comment/50 w-3">{i + 1}</span>

                    {isEditing ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draftName.trim()) {
                            savePreset(i, draftName.trim());
                            setEditingIdx(null);
                          }
                          if (e.key === "Escape") setEditingIdx(null);
                        }}
                        placeholder="Preset name…"
                        className="flex-1 bg-transparent border-b border-editor-accent/50 text-xs text-editor-fg outline-none pb-0.5"
                      />
                    ) : (
                      <span className="flex-1 text-xs truncate" style={{ color: preset ? "rgb(var(--c-fg))" : "rgb(var(--c-comment) / 0.4)" }}>
                        {preset ? preset.name : "Empty"}
                      </span>
                    )}

                    {!isEditing && preset && (
                      <>
                        <button
                          onClick={() => loadPreset(i)}
                          title="Load preset"
                          className="text-editor-comment hover:text-editor-accent transition-colors"
                        ><Play size={10} /></button>
                        <button
                          onClick={() => { setDraftName(preset.name); setEditingIdx(i); }}
                          title="Overwrite preset"
                          className="text-editor-comment hover:text-editor-fg transition-colors"
                        ><Save size={10} /></button>
                        <button
                          onClick={() => deletePreset(i)}
                          title="Delete preset"
                          className="text-editor-comment hover:text-red-400 transition-colors"
                        ><Trash2 size={10} /></button>
                      </>
                    )}

                    {!isEditing && !preset && (
                      <button
                        onClick={() => { setDraftName(`Preset ${i + 1}`); setEditingIdx(i); }}
                        title="Save current settings as preset"
                        className="text-2xs text-editor-comment/50 hover:text-editor-accent transition-colors"
                      ><Save size={10} /></button>
                    )}
                  </div>
                );
              })}
              <p className="text-2xs text-editor-comment/40 pt-0.5">Cycle presets with ⌘\</p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-editor-border/40 shrink-0 flex justify-between items-center">
          <span className="text-2xs text-editor-comment/60">Saved automatically</span>
          <button
            onClick={() => updateSettings(DEFAULT_SETTINGS)}
            className="text-2xs text-editor-comment hover:text-editor-fg transition-colors"
          >
            reset all
          </button>
        </div>
      </div>
    </>
  );
}
