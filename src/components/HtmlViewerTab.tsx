import { useState, useCallback, useEffect, useRef } from "react";
import { open }   from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Globe, RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { FileEntry } from "../store";

interface HtmlFile {
  name:     string; // relative path from root (sidebar display)
  fullPath: string; // absolute path (for URL construction)
}

// Each call returns the scan results for `dirPath`. The caller passes a
// `signal` object; if `signal.cancelled` becomes true before an await
// resolves, the results are discarded (stale-scan guard).
async function scanHtmlFiles(
  dirPath:  string,
  rootPath: string,
  signal:   { cancelled: boolean },
  depth:    number = 0,
): Promise<HtmlFile[]> {
  if (depth > 5 || signal.cancelled) return [];
  try {
    const entries = await invoke<FileEntry[]>("list_dir", { path: dirPath });
    if (signal.cancelled) return [];
    const results: HtmlFile[] = [];
    for (const entry of entries) {
      if (signal.cancelled) return [];
      if (entry.is_dir) {
        const nested = await scanHtmlFiles(entry.path, rootPath, signal, depth + 1);
        results.push(...nested);
      } else if (/\.(html|htm)$/i.test(entry.name)) {
        const relPath = entry.path.startsWith(rootPath + "/")
          ? entry.path.slice(rootPath.length + 1)
          : entry.name;
        results.push({ name: relPath, fullPath: entry.path });
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function pickInitial(files: HtmlFile[]): HtmlFile | null {
  return (
    files.find((f) => f.name === "index.html") ??
    files.find((f) => f.name === "index.htm")  ??
    files[0] ??
    null
  );
}

interface Props {
  visible: boolean;
}

export function HtmlViewerTab({ visible }: Props) {
  const [folderPath,  setFolderPath]  = useState<string | null>(null);
  const [htmlFiles,   setHtmlFiles]   = useState<HtmlFile[]>([]);
  const [activeFile,  setActiveFile]  = useState<HtmlFile | null>(null);
  const [scanning,    setScanning]    = useState(false);
  const [picking,     setPicking]     = useState(false);
  const [serverPort,  setServerPort]  = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Tracks the active scan so we can cancel it when a new folder is picked
  const scanSignal = useRef<{ cancelled: boolean }>({ cancelled: false });
  // Tracks the current server port for cleanup (ref so effects always see latest)
  const portRef    = useRef<number | null>(null);
  // Iframe ref — we update src imperatively to avoid remounting (no white flash)
  const iframeRef  = useRef<HTMLIFrameElement>(null);

  // Stop the server when serverPort changes or the tab unmounts
  useEffect(() => {
    portRef.current = serverPort;
  }, [serverPort]);

  useEffect(() => {
    return () => {
      if (portRef.current !== null) {
        invoke("stop_html_server", { port: portRef.current }).catch(() => {});
      }
    };
  }, []);

  // Update iframe src imperatively — no remount, no white flash
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (activeFile && serverPort) {
      const url = `http://127.0.0.1:${serverPort}/${activeFile.name}`;
      if (iframe.src !== url) iframe.src = url;
    }
  }, [activeFile, serverPort]);

  const pickFolder = useCallback(async () => {
    if (picking || scanning) return; // guard concurrent picks
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected !== "string") return;

      // Cancel any running scan
      scanSignal.current.cancelled = true;
      const signal = { cancelled: false };
      scanSignal.current = signal;

      // Stop previous server
      if (portRef.current !== null) {
        invoke("stop_html_server", { port: portRef.current }).catch(() => {});
        portRef.current = null;
        setServerPort(null);
      }

      setFolderPath(selected);
      setHtmlFiles([]);
      setActiveFile(null);
      setScanning(true);

      const [files, port] = await Promise.all([
        scanHtmlFiles(selected, selected, signal),
        invoke<number>("start_html_server", { path: selected }),
      ]);

      // Discard if a newer pick started while we were waiting
      if (signal.cancelled) {
        invoke("stop_html_server", { port }).catch(() => {});
        return;
      }

      portRef.current = port;
      setServerPort(port);
      setHtmlFiles(files);
      setActiveFile(pickInitial(files));
    } catch { /* dialog cancelled or error */ } finally {
      setScanning(false);
      setPicking(false);
    }
  }, [picking, scanning]);

  const iframeSrc = activeFile && serverPort
    ? `http://127.0.0.1:${serverPort}/${activeFile.name}`
    : null;

  return (
    <div
      style={{
        display:              visible ? "flex" : "none",
        flexDirection:        "column",
        flex:                 1,
        minHeight:            0,
        overflow:             "hidden",
        background:           "rgb(var(--c-blue) / 0.04)",
        backdropFilter:       "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display:              "flex",
          alignItems:           "center",
          gap:                  8,
          padding:              "0 12px",
          height:               36,
          borderBottom:         "1px solid rgb(var(--c-border) / 0.5)",
          background:           "rgb(var(--c-sidebar) / 0.35)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          fontSize:             12,
          fontFamily:           "'JetBrains Mono', monospace",
          color:                "rgb(var(--c-gutter))",
          flexShrink:           0,
        }}
      >
        <Globe size={13} style={{ color: "rgb(var(--c-accent))", flexShrink: 0 }} />
        <span
          style={{
            flex:         1,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
            fontSize:     11,
          }}
        >
          {folderPath ?? "HTML Viewer"}
        </span>

        {folderPath && (
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide file list" : "Show file list"}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          26,
              height:         26,
              borderRadius:   4,
              border:         "none",
              background:     "transparent",
              color:          "rgb(var(--c-gutter))",
              cursor:         "pointer",
              flexShrink:     0,
              transition:     "background 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-selection))";
              (e.currentTarget as HTMLElement).style.color      = "rgb(var(--c-fg))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color      = "rgb(var(--c-gutter))";
            }}
          >
            {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
          </button>
        )}

        <button
          onClick={pickFolder}
          disabled={picking || scanning}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            padding:      "3px 8px",
            borderRadius: 4,
            border:       "1px solid rgb(var(--c-border))",
            background:   "transparent",
            color:        picking || scanning ? "rgb(var(--c-gutter))" : "rgb(var(--c-fg))",
            fontSize:     11,
            fontFamily:   "'JetBrains Mono', monospace",
            cursor:       picking || scanning ? "default" : "pointer",
            flexShrink:   0,
            transition:   "background 0.1s",
            opacity:      picking || scanning ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!picking && !scanning)
              (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-selection))";
          }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {scanning
            ? <RefreshCw size={11} className="animate-spin" />
            : <FolderOpen size={11} />
          }
          {scanning ? "Scanning…" : "Open Folder"}
        </button>
      </div>

      {!folderPath ? (
        /* ── Empty state ── */
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            flex:           1,
            gap:            16,
            userSelect:     "none",
          }}
        >
          <Globe size={44} style={{ color: "rgb(var(--c-accent))", opacity: 0.2 }} />
          <p
            style={{
              fontSize:   13,
              fontFamily: "'JetBrains Mono', monospace",
              margin:     0,
              color:      "rgb(var(--c-comment))",
            }}
          >
            Open a folder to browse HTML files
          </p>
          <button
            onClick={pickFolder}
            disabled={picking}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              padding:      "8px 18px",
              borderRadius: 6,
              border:       "1px solid rgb(var(--c-accent) / 0.35)",
              background:   "rgb(var(--c-accent) / 0.12)",
              color:        "rgb(var(--c-accent))",
              fontSize:     12,
              fontFamily:   "'JetBrains Mono', monospace",
              cursor:       picking ? "default" : "pointer",
              transition:   "background 0.15s",
              opacity:      picking ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!picking) (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-accent) / 0.22)";
            }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-accent) / 0.12)"; }}
          >
            <FolderOpen size={14} />
            Open Folder
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* ── Left sidebar ── */}
          {sidebarOpen && (
            <div
              style={{
                width:                220,
                flexShrink:           0,
                borderRight:          "1px solid rgb(var(--c-border) / 0.5)",
                background:           "rgb(var(--c-sidebar) / 0.3)",
                backdropFilter:       "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                overflowY:            "auto",
                paddingTop:           4,
              }}
            >
              {scanning && (
                <div
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        6,
                    padding:    "6px 12px",
                    fontSize:   11,
                    fontFamily: "'JetBrains Mono', monospace",
                    color:      "rgb(var(--c-gutter))",
                  }}
                >
                  <RefreshCw size={10} className="animate-spin" />
                  Scanning…
                </div>
              )}
              {!scanning && htmlFiles.length === 0 && (
                <div
                  style={{
                    padding:    "8px 12px",
                    fontSize:   11,
                    fontFamily: "'JetBrains Mono', monospace",
                    color:      "rgb(var(--c-gutter))",
                  }}
                >
                  No HTML files found
                </div>
              )}
              {htmlFiles.map((f) => {
                const isActive = activeFile?.fullPath === f.fullPath;
                return (
                  <button
                    key={f.fullPath}
                    onClick={() => setActiveFile(f)}
                    title={f.name}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          6,
                      width:        "100%",
                      padding:      "4px 12px",
                      border:       "none",
                      textAlign:    "left",
                      overflow:     "hidden",
                      whiteSpace:   "nowrap",
                      textOverflow: "ellipsis",
                      fontSize:     11,
                      fontFamily:   "'JetBrains Mono', monospace",
                      cursor:       "pointer",
                      color:        isActive ? "rgb(var(--c-fg))" : "rgb(var(--c-gutter))",
                      background:   isActive ? "rgb(var(--c-selection))" : "transparent",
                      transition:   "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-selection) / 0.5)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <Globe size={10} style={{ flexShrink: 0, color: "rgb(var(--c-accent))" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── iframe — always mounted once a folder is open, src updated imperatively ── */}
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              flex:          1,
              minWidth:      0,
              overflow:      "hidden",
              position:      "relative",
            }}
          >
            {/* Placeholder shown while no file is selected yet */}
            {!iframeSrc && (
              <div
                style={{
                  position:       "absolute",
                  inset:          0,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       12,
                  fontFamily:     "'JetBrains Mono', monospace",
                  color:          "rgb(var(--c-gutter))",
                  pointerEvents:  "none",
                }}
              >
                Select an HTML file to preview
              </div>
            )}
            <iframe
              ref={iframeRef}
              style={{
                flex:       1,
                border:     "none",
                width:      "100%",
                height:     "100%",
                background: "#fff",
                // Hide iframe until a file is selected to avoid showing blank white
                visibility: iframeSrc ? "visible" : "hidden",
              }}
              title="HTML preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
