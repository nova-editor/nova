import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#191724", fg:        "#E0DEF4",
  selection: "#403D52", cursor:    "#EB6F92",
  activeLine:"#26233A", lineNum:   "#524F67",
  comment:   "#6E6A86", red:       "#EB6F92",
  orange:    "#EBBCBA", yellow:    "#F6C177",
  green:     "#31748F", cyan:      "#9CCFD8",
  blue:      "#C4A7E7", purple:    "#C4A7E7",
};

const rosePineTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#1F1D2E", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #26233A" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#403D52", outline: "1px solid #EB6F92", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#3A2E42", outline: "1px solid #EB6F92" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A3E52" },
  ".cm-tooltip":            { backgroundColor: "#1F1D2E", border: "1px solid #26233A", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#403D52", color: c.fg },
  ".cm-completionIcon":     { color: c.cyan },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const rosePineHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.purple },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.orange },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.orange },
  { tag: [t.operator, t.operatorKeyword], color: c.purple },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.purple },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.yellow },
  { tag: t.invalid,               color: c.red },
]));

export const rosePine: Extension = [rosePineTheme, rosePineHighlight];
