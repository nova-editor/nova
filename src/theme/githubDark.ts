import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#0D1117", fg:        "#E6EDF3",
  selection: "#264F78", cursor:    "#58A6FF",
  activeLine:"#161B22", lineNum:   "#484F58",
  comment:   "#8B949E", red:       "#FF7B72",
  orange:    "#FFA657", yellow:    "#E3B341",
  green:     "#7EE787", cyan:      "#39C5CF",
  blue:      "#79C0FF", purple:    "#D2A8FF",
};

const githubDarkTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#161B22", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #21262D" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#264F78", outline: "1px solid #58A6FF", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#1A3B5C", outline: "1px solid #58A6FF" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#1F4A72" },
  ".cm-tooltip":            { backgroundColor: "#161B22", border: "1px solid #30363D", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#264F78", color: c.fg },
  ".cm-completionIcon":     { color: c.blue },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const githubDarkHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.red },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.fg },
  { tag: [t.propertyName],        color: c.blue },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.purple },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.blue },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.orange },
  { tag: [t.operator, t.operatorKeyword], color: c.red },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.cyan },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.blue },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.blue },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const githubDark: Extension = [githubDarkTheme, githubDarkHighlight];
