import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#282C34", fg:        "#ABB2BF",
  selection: "#3E4451", cursor:    "#528BFF",
  activeLine:"#2C313C", lineNum:   "#4B5263",
  comment:   "#5C6370", red:       "#E06C75",
  orange:    "#D19A66", yellow:    "#E5C07B",
  green:     "#98C379", cyan:      "#56B6C2",
  blue:      "#61AFEF", purple:    "#C678DD",
};

const oneDarkTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#21252B", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #3E4451" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#3E4451", outline: "1px solid #528BFF", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#314365", outline: "1px solid #528BFF" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#3E5375" },
  ".cm-tooltip":            { backgroundColor: "#21252B", border: "1px solid #3E4451", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#3E4451", color: c.fg },
  ".cm-completionIcon":     { color: c.blue },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const oneDarkHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.purple },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.red },
  { tag: [t.propertyName],        color: c.blue },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.labelName],           color: c.red },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.orange },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.orange },
  { tag: [t.operator, t.operatorKeyword], color: c.cyan },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.cyan },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.blue },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.orange },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.green },
  { tag: t.invalid,               color: c.red },
]));

export const oneDark: Extension = [oneDarkTheme, oneDarkHighlight];
