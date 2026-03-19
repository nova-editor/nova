import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#0A0A0A", fg:        "#E8E8E8",
  selection: "#2A2A2A", cursor:    "#FFFFFF",
  activeLine:"#141414", lineNum:   "#444444",
  comment:   "#555555",
  dim1:      "#AAAAAA", // keywords, operators
  dim2:      "#CCCCCC", // functions, types
  dim3:      "#888888", // strings, constants
  dim4:      "#666666", // meta
};

const monochromeTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#050505", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #1E1E1E" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#2A2A2A", outline: "1px solid #FFFFFF", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#222222", outline: "1px solid #AAAAAA" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#333333" },
  ".cm-tooltip":            { backgroundColor: "#111111", border: "1px solid #2A2A2A", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.8)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#2A2A2A", color: c.fg },
  ".cm-completionIcon":     { color: c.dim1 },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const monochromeHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.dim1, fontWeight: "bold" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.fg },
  { tag: [t.propertyName],        color: c.dim2 },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.dim2, fontWeight: "bold" },
  { tag: [t.labelName],           color: c.dim2 },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.dim1 },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.dim2 },
  { tag: [t.operator, t.operatorKeyword], color: c.dim1 },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.dim3 },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.dim1, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.fg },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.dim1 },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.dim3 },
  { tag: t.invalid,               color: c.fg, textDecoration: "underline wavy" },
]));

export const monochrome: Extension = [monochromeTheme, monochromeHighlight];
