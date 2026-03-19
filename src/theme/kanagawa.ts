import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#1F1F28", fg:        "#DCD7BA",
  selection: "#2D4F67", cursor:    "#C34043",
  activeLine:"#2A2A37", lineNum:   "#54546D",
  comment:   "#727169", red:       "#C34043",
  orange:    "#FFA066", yellow:    "#C0A36E",
  green:     "#76946A", cyan:      "#6A9589",
  blue:      "#7E9CD8", purple:    "#957FB8",
};

const kanagawaTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#16161D", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #2A2A37" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#2D4F67", outline: "1px solid #C34043", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#223544", outline: "1px solid #C34043" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#2D4F67" },
  ".cm-tooltip":            { backgroundColor: "#16161D", border: "1px solid #2A2A37", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#2D4F67", color: c.fg },
  ".cm-completionIcon":     { color: c.red },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const kanagawaHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.purple },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.orange },
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
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const kanagawa: Extension = [kanagawaTheme, kanagawaHighlight];
