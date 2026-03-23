import { useState, useCallback, useEffect, useRef } from "react";
import { open }   from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FileText, FolderOpen, RefreshCw } from "lucide-react";

interface Props {
  visible: boolean;
}

export function PdfViewerTab({ visible }: Props) {
  const [filePath,  setFilePath]  = useState<string | null>(null);
  const [fileName,  setFileName]  = useState<string | null>(null);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [loading,   setLoading]   = useState(false);

  const portRef    = useRef<number | null>(null);
  const iframeRef  = useRef<HTMLIFrameElement>(null);

  // Keep portRef in sync for cleanup
  useEffect(() => { portRef.current = serverPort; }, [serverPort]);

  // Stop server on unmount
  useEffect(() => {
    return () => {
      if (portRef.current !== null)
        invoke("stop_html_server", { port: portRef.current }).catch(() => {});
    };
  }, []);

  // Update iframe src imperatively when file/port changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !fileName || !serverPort) return;
    const url = `http://127.0.0.1:${serverPort}/${fileName}`;
    if (iframe.src !== url) iframe.src = url;
  }, [fileName, serverPort]);

  const pickFile = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof selected !== "string") return;

      // Stop previous server
      if (portRef.current !== null) {
        invoke("stop_html_server", { port: portRef.current }).catch(() => {});
        portRef.current = null;
        setServerPort(null);
      }

      // Derive the parent directory and filename
      const lastSlash = selected.lastIndexOf("/");
      const dir  = selected.slice(0, lastSlash);
      const name = selected.slice(lastSlash + 1);

      const port = await invoke<number>("start_html_server", { path: dir });
      portRef.current = port;
      setServerPort(port);
      setFilePath(selected);
      setFileName(name);
    } catch { /* cancelled */ } finally {
      setLoading(false);
    }
  }, [loading]);

  const iframeSrc = fileName && serverPort
    ? `http://127.0.0.1:${serverPort}/${fileName}`
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
        <FileText size={13} style={{ color: "rgb(var(--c-accent))", flexShrink: 0 }} />
        <span
          style={{
            flex:         1,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
            fontSize:     11,
          }}
        >
          {filePath ?? "PDF Viewer"}
        </span>
        <button
          onClick={pickFile}
          disabled={loading}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            padding:      "3px 8px",
            borderRadius: 4,
            border:       "1px solid rgb(var(--c-border))",
            background:   "transparent",
            color:        loading ? "rgb(var(--c-gutter))" : "rgb(var(--c-fg))",
            fontSize:     11,
            fontFamily:   "'JetBrains Mono', monospace",
            cursor:       loading ? "default" : "pointer",
            flexShrink:   0,
            opacity:      loading ? 0.5 : 1,
            transition:   "background 0.1s",
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-selection))";
          }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {loading
            ? <RefreshCw size={11} className="animate-spin" />
            : <FolderOpen size={11} />
          }
          {loading ? "Opening…" : "Open PDF"}
        </button>
      </div>

      {!filePath ? (
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
          <FileText size={44} style={{ color: "rgb(var(--c-accent))", opacity: 0.2 }} />
          <p
            style={{
              fontSize:   13,
              fontFamily: "'JetBrains Mono', monospace",
              margin:     0,
              color:      "rgb(var(--c-comment))",
            }}
          >
            Open a PDF file to read it here
          </p>
          <button
            onClick={pickFile}
            disabled={loading}
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
              cursor:       loading ? "default" : "pointer",
              opacity:      loading ? 0.5 : 1,
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-accent) / 0.22)";
            }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--c-accent) / 0.12)"; }}
          >
            <FolderOpen size={14} />
            Open PDF
          </button>
        </div>
      ) : (
        /* ── PDF iframe ── */
        <div
          style={{
            display:  "flex",
            flex:     1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <iframe
            ref={iframeRef}
            style={{
              flex:       1,
              border:     "none",
              width:      "100%",
              height:     "100%",
              background: "#fff",
              visibility: iframeSrc ? "visible" : "hidden",
            }}
            title="PDF preview"
          />
        </div>
      )}
    </div>
  );
}
