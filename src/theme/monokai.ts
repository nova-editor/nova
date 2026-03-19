import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#272822", fg:        "#F8F8F2",
  selection: "#49483E", cursor:    "#F8F8F0",
  activeLine:"#2D2E27", lineNum:   "#75715E",
  comment:   "#75715E", red:       "#F92672",
  orange:    "#FD971F", yellow:    "#E6DB74",
  green:     "#A6E22E", cyan:      "#66D9E8",
  purple:    "#AE81FF",
};

const monokaiTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#1E1F1C", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #1A1B17" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#49483E", outline: "1px solid #A6E22E", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#3A3B2E", outline: "1px solid #A6E22E" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A4D30" },
  ".cm-tooltip":            { backgroundColor: "#1E1F1C", border: "1px solid #49483E", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#49483E", color: c.fg },
  ".cm-completionIcon":     { color: c.cyan },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const monokaiHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.red },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.fg },
  { tag: [t.propertyName],        color: c.green },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.green },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.cyan },
  { tag: [t.operator, t.operatorKeyword], color: c.red },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.yellow },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.cyan, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.yellow },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.purple },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.yellow },
  { tag: t.invalid,               color: c.red },
]));

export const monokai: Extension = [monokaiTheme, monokaiHighlight];
