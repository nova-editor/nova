import { useEffect, useRef, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Extension, Compartment } from "@codemirror/state";
import {
  foldGutter, indentOnInput, syntaxHighlighting,
  defaultHighlightStyle, bracketMatching, foldKeymap, indentUnit,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { getTheme } from "../theme/themes";
import { vimLite, VimMode } from "../extensions/vimLite";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { useStore, tabContentMap, FileTab } from "../store";

// ── Compartments — one per reconfigurable axis ────────────────────────────────
// Module-level tokens: each EditorView that includes them gets its own slot.
// Changing settings dispatches a reconfigure effect — no view destroy, no
// content loss, no undo history wipe, no cursor jump.
const cFont     = new Compartment();
const cLang     = new Compartment();
const cWrap     = new Compartment();
const cLineNum  = new Compartment();
const cIndent   = new Compartment();
const cBrackets = new Compartment();
const cComplete = new Compartment();
const cVim         = new Compartment();
const cTheme       = new Compartment();
const cIndentLines = new Compartment();
const cTabSize     = new Compartment();

// ── Language parser loader — dynamic imports are module-cached after first load
async function loadLanguage(lang: string): Promise<Extension> {
  switch (lang) {
    case "typescript": { const { javascript } = await import("@codemirror/lang-javascript"); return javascript({ typescript: true, jsx: true }); }
    case "javascript": { const { javascript } = await import("@codemirror/lang-javascript"); return javascript({ jsx: true }); }
    case "rust":       { const { rust }       = await import("@codemirror/lang-rust");       return rust(); }
    case "python":     { const { python }     = await import("@codemirror/lang-python");     return python(); }
    case "go":         { const { go }         = await import("@codemirror/lang-go");         return go(); }
    case "json":       { const { json }       = await import("@codemirror/lang-json");       return json(); }
    case "markdown":   { const { markdown }   = await import("@codemirror/lang-markdown");   return markdown(); }
    case "html":       { const { html }       = await import("@codemirror/lang-html");       return html(); }
    case "css":        { const { css }        = await import("@codemirror/lang-css");        return css(); }
    case "sql":        { const { sql }        = await import("@codemirror/lang-sql");        return sql(); }
    case "java":       { const { java }       = await import("@codemirror/lang-java");       return java(); }
    case "cpp":        { const { cpp }        = await import("@codemirror/lang-cpp");        return cpp(); }
    default:           return [];
  }
}

function relativeLineNumbers() {
  return lineNumbers({
    formatNumber(lineNo, state) {
      const curLine = state.doc.lineAt(state.selection.main.head).number;
      return lineNo === curLine ? String(lineNo) : String(Math.abs(curLine - lineNo));
    },
  });
}

function makeFontTheme(fontFamily: string, fontSize: number): Extension {
  return EditorView.theme({
    ".cm-content":  { fontFamily, fontSize: `${fontSize}px` },
    ".cm-gutters":  { fontFamily },
    ".cm-scroller": { fontFamily },
  });
}

// Static extensions — built once, shared across all views
const baseExtensions: Extension = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
    indentWithTab,
  ]),
];

interface EditorProps {
  tab:            FileTab;
  showMdPreview?: boolean;
}

export function Editor({ tab, showMdPreview = true }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);

  const markDirty  = useStore((s) => s.markDirty);
  const saveTab    = useStore((s) => s.saveTab);
  const setVimMode = useStore((s) => s.setVimMode);
  const s          = useStore((s) => s.settings.editor);

  // Stable refs — listeners registered once always call the latest callback
  const markDirtyRef  = useRef(markDirty);
  const saveTabRef    = useRef(saveTab);
  const setVimModeRef = useRef(setVimMode);
  const tabPathRef    = useRef(tab.path);
  const tabLangRef    = useRef(tab.language);
  useEffect(() => { markDirtyRef.current  = markDirty;    }, [markDirty]);
  useEffect(() => { saveTabRef.current    = saveTab;      }, [saveTab]);
  useEffect(() => { setVimModeRef.current = setVimMode;   }, [setVimMode]);
  useEffect(() => { tabPathRef.current    = tab.path;     }, [tab.path]);
  useEffect(() => { tabLangRef.current    = tab.language; }, [tab.language]);

  // Preview content in local state — only this component re-renders on change
  const [previewContent, setPreviewContent] = useState<string>("");

  // Reset preview when switching files
  useEffect(() => {
    if (tab.language === "markdown") {
      setPreviewContent(tabContentMap.get(tab.path) ?? "");
    }
  }, [tab.path, tab.language]);

  // ── Create/destroy the view — ONLY when switching files ──────────────────
  // Settings changes are handled by compartment reconfigure effects below.
  // This means: font size change = 1ms dispatch, not a full rebuild.
  useEffect(() => {
    if (!containerRef.current) return;
    let langCancelled = false;

    const view = new EditorView({
      state: EditorState.create({
        doc: tabContentMap.get(tab.path) ?? "",
        extensions: [
          baseExtensions,
          cFont.of(makeFontTheme(s.fontFamily, s.fontSize)),
          cLang.of([]),   // async-filled below; editor is immediately usable
          cWrap.of(s.lineWrap ? EditorView.lineWrapping : []),
          cLineNum.of(s.relativeNumbers ? relativeLineNumbers() : lineNumbers()),
          cIndent.of(indentUnit.of(" ".repeat(s.tabSize))),
          cTabSize.of(EditorState.tabSize.of(s.tabSize)),
          cBrackets.of(s.bracketMatch ? [bracketMatching(), closeBrackets()] : []),
          cComplete.of(s.autocomplete ? autocompletion() : []),
          cVim.of(s.vimEnabled ? vimLite((m: VimMode) => setVimModeRef.current(m)) : []),
          cTheme.of(getTheme(s.theme)),
          cIndentLines.of(s.indentLines ? indentationMarkers({ markerType: "fullScope", thickness: 1 }) : []),
          EditorView.domEventHandlers({
            keydown(e) {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                saveTabRef.current(tabPathRef.current);
              }
              if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
                e.preventDefault();
                const cur = useStore.getState().settings.editor.fontSize;
                useStore.getState().updateSettings({ editor: { fontSize: Math.max(8, cur - 1) } });
              }
              if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
                e.preventDefault();
                const cur = useStore.getState().settings.editor.fontSize;
                useStore.getState().updateSettings({ editor: { fontSize: Math.min(32, cur + 1) } });
              }
            },
          }),
          EditorView.updateListener.of((update) => {
            // Update cursor position on any selection or doc change
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              useStore.getState().setCursor(line.number, head - line.from + 1);
            }
            if (!update.docChanged) return;
            const content = update.state.doc.toString();
            // Write to tabContentMap synchronously — always current before save fires
            tabContentMap.set(tabPathRef.current, content);
            markDirtyRef.current(tabPathRef.current);
            // Only update local preview state for markdown files
            if (tabLangRef.current === "markdown") setPreviewContent(content);
          }),
        ],
      }),
      parent: containerRef.current,
    });

    view.dom.dataset.vimMode = "normal";
    viewRef.current = view;
    view.focus();

    // Load language parser without blocking the editor opening
    loadLanguage(tab.language).then((ext) => {
      if (langCancelled || !viewRef.current) return;
      viewRef.current.dispatch({ effects: cLang.reconfigure(ext) });
    });

    return () => {
      langCancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.path, tab.language]);

  // ── Surgical reconfigure effects — zero view rebuild, zero content loss ────

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cFont.reconfigure(makeFontTheme(s.fontFamily, s.fontSize)) });
  }, [s.fontSize, s.fontFamily]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cWrap.reconfigure(s.lineWrap ? EditorView.lineWrapping : []) });
  }, [s.lineWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cLineNum.reconfigure(s.relativeNumbers ? relativeLineNumbers() : lineNumbers()) });
  }, [s.relativeNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: [
      cIndent.reconfigure(indentUnit.of(" ".repeat(s.tabSize))),
      cTabSize.reconfigure(EditorState.tabSize.of(s.tabSize)),
    ]});
  }, [s.tabSize]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cBrackets.reconfigure(s.bracketMatch ? [bracketMatching(), closeBrackets()] : []) });
  }, [s.bracketMatch]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cComplete.reconfigure(s.autocomplete ? autocompletion() : []) });
  }, [s.autocomplete]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cIndentLines.reconfigure(
      s.indentLines ? indentationMarkers({ markerType: "fullScope", thickness: 1 }) : []
    )});
  }, [s.indentLines]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: cVim.reconfigure(s.vimEnabled ? vimLite((m: VimMode) => setVimModeRef.current(m)) : []),
    });
  }, [s.vimEnabled]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: cTheme.reconfigure(getTheme(s.theme)) });
  }, [s.theme]);

  // ── Sync external content changes (revert / external file change) ─────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !tab) return;
    const stored  = tabContentMap.get(tab.path) ?? "";
    const current = view.state.doc.toString();
    if (current !== stored && !tab.dirty) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: stored } });
      if (tab.language === "markdown") setPreviewContent(stored);
    }
  }, [tab.path, tab.dirty]);

  const splitView = tab.language === "markdown" && showMdPreview;

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div ref={containerRef} className={splitView ? "w-1/2 h-full" : "w-full h-full"} />
      {splitView && <MarkdownPreview content={previewContent} />}
    </div>
  );
}
