import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const c = {
  bg:        "#272E33", fg:        "#D3C6AA",
  selection: "#374247", cursor:    "#A7C080",
  activeLine:"#2E383C", lineNum:   "#4A555B",
  comment:   "#5C6A72", red:       "#E67E80",
  orange:    "#E69875", yellow:    "#DBBC7F",
  green:     "#A7C080", cyan:      "#83C092",
  blue:      "#7FBBB3", purple:    "#D699B6",
};

const everforestTheme = EditorView.theme({
  "&":                      { color: c.fg, backgroundColor: c.bg },
  ".cm-content":            { caretColor: c.cursor, padding: "4px 0" },
  ".cm-cursor":             { borderLeftColor: c.cursor, borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": { backgroundColor: c.selection + " !important" },
  ".cm-panels":             { backgroundColor: "#1E2326", color: c.fg },
  ".cm-activeLine":         { backgroundColor: c.activeLine },
  ".cm-activeLineGutter":   { backgroundColor: c.activeLine, color: c.fg },
  ".cm-gutters":            { backgroundColor: c.bg, color: c.lineNum, border: "none", borderRight: "1px solid #374247" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
  ".cm-foldGutter":         { paddingLeft: "4px" },
  ".cm-matchingBracket":    { backgroundColor: "#374247", outline: "1px solid #A7C080", borderRadius: "2px" },
  ".cm-searchMatch":        { backgroundColor: "#2D3B30", outline: "1px solid #A7C080" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#3D4B40" },
  ".cm-tooltip":            { backgroundColor: "#1E2326", border: "1px solid #374247", borderRadius: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", color: c.fg },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#374247", color: c.fg },
  ".cm-completionIcon":     { color: c.green },
  ".cm-completionLabel":    { color: c.fg },
  ".cm-completionDetail":   { color: c.comment, fontStyle: "italic" },
}, { dark: true });

const everforestHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,               color: c.red },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: c.fg },
  { tag: [t.propertyName],        color: c.blue },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.green },
  { tag: [t.labelName],           color: c.yellow },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.purple },
  { tag: [t.definition(t.name), t.separator], color: c.fg },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.yellow },
  { tag: [t.operator, t.operatorKeyword], color: c.orange },
  { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: c.cyan },
  { tag: [t.meta, t.comment],     color: c.comment, fontStyle: "italic" },
  { tag: t.strong,                fontWeight: "bold" },
  { tag: t.emphasis,              fontStyle: "italic" },
  { tag: t.strikethrough,         textDecoration: "line-through" },
  { tag: t.link,                  color: c.blue, textDecoration: "underline" },
  { tag: t.heading,               fontWeight: "bold", color: c.green },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.purple },
  { tag: [t.processingInstruction, t.string, t.inserted], color: c.yellow },
  { tag: t.invalid,               color: c.red },
]));

export const everforest: Extension = [everforestTheme, everforestHighlight];
