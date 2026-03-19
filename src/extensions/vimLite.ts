import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type VimMode = "normal" | "insert";

export const setVimModeEffect  = StateEffect.define<VimMode>();
const appendDigitEffect = StateEffect.define<string>();
const clearDigitsEffect = StateEffect.define<null>();
const setPendingGEffect = StateEffect.define<boolean>();

interface VimState {
  mode:     VimMode;
  digits:   string;
  pendingG: boolean;
}

export const vimField = StateField.define<VimState>({
  create: () => ({ mode: "normal", digits: "", pendingG: false }),
  update(val, tr) {
    let s = val;
    for (const e of tr.effects) {
      if (e.is(setVimModeEffect))  s = { mode: e.value, digits: "", pendingG: false };
      if (e.is(appendDigitEffect)) s = { ...s, digits: s.digits + e.value, pendingG: false };
      if (e.is(clearDigitsEffect)) s = { ...s, digits: "", pendingG: false };
      if (e.is(setPendingGEffect)) s = { ...s, pendingG: e.value, digits: "" };
    }
    return s;
  },
});

function getCount(vim: VimState): number {
  const n = parseInt(vim.digits, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

function movePos(view: EditorView, dx: number, dy: number, count: number) {
  let pos = view.state.selection.main.head;
  const { state } = view;
  for (let i = 0; i < count; i++) {
    const line = state.doc.lineAt(pos);
    if (dy !== 0) {
      const newNo   = Math.max(1, Math.min(state.doc.lines, line.number + dy));
      const newLine = state.doc.line(newNo);
      const col     = Math.min(pos - line.from, Math.max(0, newLine.length - 1));
      pos = newLine.from + col;
    } else {
      const newPos = pos + dx;
      pos = Math.max(line.from, Math.min(Math.max(line.from, line.to - 1), newPos));
    }
  }
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects:   clearDigitsEffect.of(null),
    scrollIntoView: true,
    userEvent: "select",
  });
}

function applyMode(
  view: EditorView,
  mode: VimMode,
  pos: number | undefined,
  onModeChange: (m: VimMode) => void,
) {
  const dispatch: Parameters<typeof view.dispatch>[0] = {
    effects: setVimModeEffect.of(mode),
  };
  if (pos !== undefined) dispatch.selection = EditorSelection.cursor(pos);
  view.dispatch(dispatch);
  view.dom.dataset.vimMode = mode;
  onModeChange(mode);
}

export function vimLite(onModeChange: (mode: VimMode) => void) {
  return [
    vimField,

    // Keep data-vim-mode in sync so CSS can style the block cursor
    EditorView.updateListener.of((upd) => {
      const mode = upd.state.field(vimField).mode;
      upd.view.dom.dataset.vimMode = mode;
    }),

    EditorView.domEventHandlers({
      keydown(e, view) {
        const vim = view.state.field(vimField);

        // ── Insert mode ────────────────────────────────────────────────────
        if (vim.mode === "insert") {
          if (e.key === "Escape") {
            e.preventDefault();
            const pos  = view.state.selection.main.head;
            const line = view.state.doc.lineAt(pos);
            applyMode(view, "normal", Math.max(line.from, pos - 1), onModeChange);
            return true;
          }
          // Arrow keys: handle explicitly — `return false` propagation is unreliable
          // in insert mode across CodeMirror versions / event ordering.
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            const pos = view.state.selection.main.head;
            view.dispatch({ selection: EditorSelection.cursor(Math.max(0, pos - 1)), scrollIntoView: true, userEvent: "select" });
            return true;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            const pos = view.state.selection.main.head;
            view.dispatch({ selection: EditorSelection.cursor(Math.min(view.state.doc.length, pos + 1)), scrollIntoView: true, userEvent: "select" });
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const { state } = view;
            const pos  = state.selection.main.head;
            const line = state.doc.lineAt(pos);
            if (line.number > 1) {
              const prev = state.doc.line(line.number - 1);
              const col  = Math.min(pos - line.from, prev.length);
              view.dispatch({ selection: EditorSelection.cursor(prev.from + col), scrollIntoView: true, userEvent: "select" });
            }
            return true;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const { state } = view;
            const pos  = state.selection.main.head;
            const line = state.doc.lineAt(pos);
            if (line.number < state.doc.lines) {
              const next = state.doc.line(line.number + 1);
              const col  = Math.min(pos - line.from, next.length);
              view.dispatch({ selection: EditorSelection.cursor(next.from + col), scrollIntoView: true, userEvent: "select" });
            }
            return true;
          }
          return false; // let CodeMirror handle typing, backspace, etc.
        }

        // ── Normal mode ────────────────────────────────────────────────────
        // Always pass Ctrl/Meta combos through (Ctrl+S, Ctrl+P, undo, etc.)
        if (e.ctrlKey || e.metaKey) return false;

        const key   = e.key;
        const count = getCount(vim);

        // Digit prefix accumulation
        if (/^[1-9]$/.test(key) || (key === "0" && vim.digits.length > 0)) {
          e.preventDefault();
          view.dispatch({ effects: appendDigitEffect.of(key) });
          return true;
        }

        // Pending 'g' — only 'gg' supported
        if (vim.pendingG) {
          view.dispatch({ effects: setPendingGEffect.of(false) });
          e.preventDefault();
          if (key === "g") {
            const lineNo    = vim.digits.length > 0 ? Math.min(count, view.state.doc.lines) : 1;
            const firstLine = view.state.doc.line(lineNo);
            view.dispatch({ selection: EditorSelection.cursor(firstLine.from), scrollIntoView: true });
          }
          return true;
        }

        switch (key) {
          // Motion
          case "h": e.preventDefault(); movePos(view, -1,  0, count); return true;
          case "l": e.preventDefault(); movePos(view,  1,  0, count); return true;
          case "j": e.preventDefault(); movePos(view,  0,  1, count); return true;
          case "k": e.preventDefault(); movePos(view,  0, -1, count); return true;

          case "0": {
            e.preventDefault();
            const line = view.state.doc.lineAt(view.state.selection.main.head);
            view.dispatch({ selection: EditorSelection.cursor(line.from), effects: clearDigitsEffect.of(null), scrollIntoView: true });
            return true;
          }
          case "$":
          case "End": {
            e.preventDefault();
            const line = view.state.doc.lineAt(view.state.selection.main.head);
            view.dispatch({ selection: EditorSelection.cursor(Math.max(line.from, line.to - 1)), effects: clearDigitsEffect.of(null), scrollIntoView: true });
            return true;
          }
          case "^":
          case "Home": {
            e.preventDefault();
            const line   = view.state.doc.lineAt(view.state.selection.main.head);
            const text   = view.state.doc.sliceString(line.from, line.to);
            const indent = text.match(/^\s*/)?.[0].length ?? 0;
            view.dispatch({ selection: EditorSelection.cursor(line.from + indent), effects: clearDigitsEffect.of(null), scrollIntoView: true });
            return true;
          }
          case "G": {
            e.preventDefault();
            const lineNo    = vim.digits.length > 0 ? Math.min(count, view.state.doc.lines) : view.state.doc.lines;
            const targetLine = view.state.doc.line(lineNo);
            view.dispatch({ selection: EditorSelection.cursor(targetLine.from), effects: clearDigitsEffect.of(null), scrollIntoView: true });
            return true;
          }
          case "g": {
            e.preventDefault();
            view.dispatch({ effects: setPendingGEffect.of(true) });
            return true;
          }

          // Enter insert mode
          case "i":
            e.preventDefault();
            applyMode(view, "insert", undefined, onModeChange);
            return true;

          case "I": {
            e.preventDefault();
            const line   = view.state.doc.lineAt(view.state.selection.main.head);
            const text   = view.state.doc.sliceString(line.from, line.to);
            const indent = text.match(/^\s*/)?.[0].length ?? 0;
            applyMode(view, "insert", line.from + indent, onModeChange);
            return true;
          }
          case "a": {
            e.preventDefault();
            const pos  = view.state.selection.main.head;
            const line = view.state.doc.lineAt(pos);
            applyMode(view, "insert", Math.min(line.to, pos + 1), onModeChange);
            return true;
          }
          case "A": {
            e.preventDefault();
            const line = view.state.doc.lineAt(view.state.selection.main.head);
            applyMode(view, "insert", line.to, onModeChange);
            return true;
          }
          case "o": {
            e.preventDefault();
            const line = view.state.doc.lineAt(view.state.selection.main.head);
            view.dispatch({
              changes: { from: line.to, insert: "\n" },
              selection: EditorSelection.cursor(line.to + 1),
              effects: setVimModeEffect.of("insert"),
            });
            view.dom.dataset.vimMode = "insert";
            onModeChange("insert");
            return true;
          }
          case "O": {
            e.preventDefault();
            const line = view.state.doc.lineAt(view.state.selection.main.head);
            view.dispatch({
              changes: { from: line.from, insert: "\n" },
              selection: EditorSelection.cursor(line.from),
              effects: setVimModeEffect.of("insert"),
            });
            view.dom.dataset.vimMode = "insert";
            onModeChange("insert");
            return true;
          }

          case "Escape":
            e.preventDefault();
            view.dispatch({ effects: clearDigitsEffect.of(null) });
            return true;

          default:
            // Block everything else in normal mode
            e.preventDefault();
            return true;
        }
      },
    }),
  ];
}
