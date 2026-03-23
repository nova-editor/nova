import { useEffect, useRef, useState, useCallback } from "react";
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Extension, Compartment } from "@codemirror/state";
import {
  foldGutter, syntaxHighlighting,
  defaultHighlightStyle, bracketMatching, foldKeymap, indentUnit,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { getTheme } from "../theme/themes";
import { vimLite, VimMode } from "../extensions/vimLite";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { useStore, tabContentMap, FileTab } from "../store";
import { invoke } from "@tauri-apps/api/core";

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
    // Remove Tab from completionKeymap — accept completions with Enter, not Tab
    ...completionKeymap.filter((b) => b.key !== "Tab"),
    ...lintKeymap,
    // Custom Tab: only use indentMore (start-of-line) for multi-line selections;
    // single cursor or single-line selection always inserts indent at cursor.
    {
      key: "Tab",
      run: ({ state, dispatch }) => {
        const multiLine = state.selection.ranges.some((r) => {
          if (r.empty) return false;
          return state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number;
        });
        if (multiLine) {
          return indentMore({ state, dispatch });
        }
        dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), {
          scrollIntoView: true,
          userEvent: "input",
        }));
        return true;
      },
      shift: indentLess,
    },
  ]),
];

interface EditorProps {
  tab:            FileTab;
  showMdPreview?: boolean; // kept for API compat, no longer used
}

export function Editor({ tab }: EditorProps) {
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
            // Push content to the standalone preview tab if open
            if (tabLangRef.current === "markdown")
              useStore.getState().updateMdPreviewContent(tabPathRef.current, content);
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

  // ── Reload file when external process modifies it (e.g. Claude edits) ───────
  const tabPathRef2 = useRef(tab.path);
  useEffect(() => { tabPathRef2.current = tab.path; }, [tab.path]);

  const reloadFromDisk = useCallback(async (changedPath: string) => {
    if (changedPath !== tabPathRef2.current) return;
    try {
      const content = await invoke<string>("read_file", { path: changedPath });
      tabContentMap.set(changedPath, content);
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });
      }
    } catch { /* file may be temporarily unavailable during write */ }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => reloadFromDisk((e as CustomEvent<string>).detail);
    window.addEventListener("nova:file-changed", handler);
    return () => window.removeEventListener("nova:file-changed", handler);
  }, [reloadFromDisk]);

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
      if (tab.language === "markdown")
        useStore.getState().updateMdPreviewContent(tab.path, stored);
    }
  }, [tab.path, tab.dirty]);

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
