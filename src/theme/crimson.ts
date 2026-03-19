import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#1A0A0A", fg:        "#F0D0D0",
  selection: "#4A1A1A", cursor:    "#E5173F",
  activeLine:"#260E0E", lineNum:   "#6B3A3A",
  comment:   "#7A4040", red:       "#E5173F",
  orange:    "#E8724A", yellow:    "#E8B84A",
  green:     "#7EC86A", cyan:      "#5CC8C0",
  blue:      "#7AACDC", purple:    "#C87AB8",
};

const crimsonTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#120606", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #2E1010" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#4A1A1A", outline: "1px solid #E5173F", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#3A0E0E", outline: "1px solid #E5173F" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#5A1A1A" },
  ".cm-tooltip":            { backgroundColor: "#1E0A0A", border: "1px solid #3A1010", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#4A1A1A", color: c.fg },
  ".cm-completionIcon":     { color: c.red },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const crimsonHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.red },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.orange },
  { tag: [t.propertyName],        color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.orange },
  { tag: [t.operator, t.operatorKeyword], color: c.red },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.green },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.red },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.purple },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.yellow },
  { tag: t.invalid,               color: c.red },
]));

export const crimson: Extension = [crimsonTheme, crimsonHighlight];
