import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#2E3440", fg:        "#D8DEE9",
  selection: "#434C5E", cursor:    "#88C0D0",
  activeLine:"#3B4252", lineNum:   "#4C566A",
  comment:   "#616E88", red:       "#BF616A",
  orange:    "#D08770", yellow:    "#EBCB8B",
  green:     "#A3BE8C", cyan:      "#88C0D0",
  blue:      "#81A1C1", purple:    "#B48EAD",
};

const nordTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#272C36", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #252A32" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#434C5E", outline: "1px solid #88C0D0", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#3B4A34", outline: "1px solid #A3BE8C" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A6040" },
  ".cm-tooltip":            { backgroundColor: "#272C36", border: "1px solid #3B4252", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#434C5E", color: c.fg },
  ".cm-completionIcon":     { color: c.cyan },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const nordHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.blue },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.cyan },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.orange },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.yellow },
  { tag: [t.operator, t.operatorKeyword], color: c.blue },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.cyan, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.blue },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const nord: Extension = [nordTheme, nordHighlight];
