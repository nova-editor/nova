import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#282A36", fg:        "#F8F8F2",
  selection: "#44475A", cursor:    "#FF79C6",
  activeLine:"#313442", lineNum:   "#6272A4",
  comment:   "#6272A4", red:       "#FF5555",
  orange:    "#FFB86C", yellow:    "#F1FA8C",
  green:     "#50FA7B", cyan:      "#8BE9FD",
  purple:    "#FF79C6",
};

const draculaTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#21232E", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #1a1b26" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#44475A", outline: "1px solid #FF79C6", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#374225", outline: "1px solid #50FA7B" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A5E2D" },
  ".cm-tooltip":            { backgroundColor: "#21232E", border: "1px solid #44475A", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#44475A", color: c.fg },
  ".cm-completionIcon":     { color: c.cyan },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const draculaHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.purple },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.orange },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.green },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.yellow },
  { tag: [t.operator, t.operatorKeyword], color: c.purple },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.cyan },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.cyan, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.purple },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.yellow },
  { tag: t.invalid,               color: c.red },
]));

export const dracula: Extension = [draculaTheme, draculaHighlight];
