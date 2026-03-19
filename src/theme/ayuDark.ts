import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#0D1017", fg:        "#BFBDB6",
  selection: "#273747", cursor:    "#E6B450",
  activeLine:"#131721", lineNum:   "#3D4B5C",
  comment:   "#5C6773", red:       "#F07178",
  orange:    "#FF8F40", yellow:    "#E6B450",
  green:     "#7FD962", cyan:      "#95E6CB",
  blue:      "#59C2FF", purple:    "#D2A6FF",
};

const ayuDarkTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#0B0E14", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #1A2130" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#273747", outline: "1px solid #E6B450", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#1D2B38", outline: "1px solid #E6B450" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#2D3D4A" },
  ".cm-tooltip":            { backgroundColor: "#0D1017", border: "1px solid #1A2130", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#273747", color: c.fg },
  ".cm-completionIcon":     { color: c.yellow },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const ayuDarkHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.orange },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.yellow },
  { tag: [t.labelName],           color: c.green },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.orange },
  { tag: [t.operator, t.operatorKeyword], color: c.orange },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.yellow },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.purple },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const ayuDark: Extension = [ayuDarkTheme, ayuDarkHighlight];
