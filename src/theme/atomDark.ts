import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

const color = {
  bg:        "#282C34",
  fg:        "#ABB2BF",
  selection: "#3E4451",
  cursor:    "#528BFF",
  activeLine:"#2C313A",
  lineNum:   "#4B5263",
  comment:   "#5C6370",
  red:       "#E06C75",
  orange:    "#D19A66",
  yellow:    "#E5C07B",
  green:     "#98C379",
  cyan:      "#56B6C2",
  blue:      "#61AFEF",
  purple:    "#C678DD",
};

export const atomDarkTheme = EditorView.theme(
  {
    "&": {
      color:           color.fg,
      backgroundColor: color.bg,
    },
    ".cm-content": {
      caretColor: color.cursor,
      padding: "4px 0",
    },
    ".cm-cursor": {
      borderLeftColor: color.cursor,
      borderLeftWidth: "2px",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: color.selection + " !important",
    },
    ".cm-panels": { backgroundColor: "#21252B", color: color.fg },
    ".cm-activeLine":      { backgroundColor: color.activeLine },
    ".cm-activeLineGutter":{ backgroundColor: color.activeLine, color: color.fg },
    ".cm-gutters": {
      backgroundColor: color.bg,
      color:           color.lineNum,
      border:          "none",
      borderRight:     "1px solid #181A1F",
    },
    ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "12px", paddingRight: "8px" },
    ".cm-foldGutter": { paddingLeft: "4px" },
    ".cm-matchingBracket": {
      backgroundColor: "#3E4451",
      outline:         "1px solid #528BFF",
      borderRadius:    "2px",
    },
    ".cm-searchMatch":          { backgroundColor: "#3E4A1E", outline: "1px solid #98C379" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#4A5E28" },
    ".cm-tooltip": {
      backgroundColor: "#21252B",
      border:          "1px solid #181A1F",
      borderRadius:    "6px",
      boxShadow:       "0 8px 32px rgba(0,0,0,0.5)",
      color:           color.fg,
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#3E4451",
      color:           color.fg,
    },
    ".cm-completionIcon":  { color: color.blue },
    ".cm-completionLabel": { color: color.fg },
    ".cm-completionDetail":{ color: color.comment, fontStyle: "italic" },
    ".cm-lint-marker-error":   { color: color.red },
    ".cm-lint-marker-warning": { color: color.yellow },
  },
  { dark: true }
);

export const atomDarkHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword,               color: color.purple },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: color.red },
    { tag: [t.propertyName],        color: color.red },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: color.blue },
    { tag: [t.labelName],           color: color.yellow },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: color.orange },
    { tag: [t.definition(t.name), t.separator], color: color.fg },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: color.yellow },
    { tag: [t.operator, t.operatorKeyword],  color: color.cyan },
    { tag: [t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: color.green },
    { tag: [t.meta, t.comment],     color: color.comment, fontStyle: "italic" },
    { tag: t.strong,                fontWeight: "bold" },
    { tag: t.emphasis,              fontStyle: "italic" },
    { tag: t.strikethrough,         textDecoration: "line-through" },
    { tag: t.link,                  color: color.blue, textDecoration: "underline" },
    { tag: t.heading,               fontWeight: "bold", color: color.blue },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: color.orange },
    { tag: [t.processingInstruction, t.string, t.inserted], color: color.green },
    { tag: t.invalid,               color: color.red },
  ])
);

export const atomDark: Extension = [atomDarkTheme, atomDarkHighlight];
