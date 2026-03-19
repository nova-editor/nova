import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#1a1b26", fg:        "#c0caf5",
  selection: "#283457", cursor:    "#7aa2f7",
  activeLine:"#1e2030", lineNum:   "#3b4261",
  comment:   "#565f89", red:       "#f7768e",
  orange:    "#ff9e64", yellow:    "#e0af68",
  green:     "#9ece6a", cyan:      "#7dcfff",
  blue:      "#7aa2f7", purple:    "#9d7cd8",
  magenta:   "#bb9af7",
};

const tokyoNightTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#16161e", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #13131d" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#283457", outline: "1px solid #7aa2f7", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#2d3b22", outline: "1px solid #9ece6a" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#3a4f2d" },
  ".cm-tooltip":            { backgroundColor: "#16161e", border: "1px solid #283457", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#283457", color: c.fg },
  ".cm-completionIcon":     { color: c.blue },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const tokyoNightHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.magenta },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.blue },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.orange },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.yellow },
  { tag: [t.operator, t.operatorKeyword], color: c.cyan },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.blue },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const tokyoNight: Extension = [tokyoNightTheme, tokyoNightHighlight];
