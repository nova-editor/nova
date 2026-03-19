import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#282828", fg:        "#EBDBB2",
  selection: "#504945", cursor:    "#EBDBB2",
  activeLine:"#32302F", lineNum:   "#665C54",
  comment:   "#928374", red:       "#FB4934",
  orange:    "#FE8019", yellow:    "#FABD2F",
  green:     "#B8BB26", cyan:      "#8EC07C",
  blue:      "#83A598", purple:    "#D3869B",
};

const gruvboxTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#1D2021", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #1D2021" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#504945", outline: "1px solid #FABD2F", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#3C3426", outline: "1px solid #FABD2F" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A4130" },
  ".cm-tooltip":            { backgroundColor: "#1D2021", border: "1px solid #3C3836", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#504945", color: c.fg },
  ".cm-completionIcon":     { color: c.blue },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const gruvboxHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.red },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.blue },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.green },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.yellow },
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

export const gruvboxDark: Extension = [gruvboxTheme, gruvboxHighlight];
