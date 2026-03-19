import { Extension } from "@codemirror/state";
import { atomDark }        from "./atomDark";
import { dracula }         from "./dracula";
import { nord }            from "./nord";
import { tokyoNight }      from "./tokyoNight";
import { monokai }         from "./monokai";
import { gruvboxDark }     from "./gruvboxDark";
import { catppuccinMocha } from "./catppuccinMocha";
import { githubDark }      from "./githubDark";
import { rosePine }        from "./rosePine";
import { palenight }       from "./palenight";
import { crimson }         from "./crimson";
import { ayuDark }         from "./ayuDark";
import { oneDark }         from "./oneDark";
import { kanagawa }        from "./kanagawa";
import { everforest }      from "./everforest";
import { monochrome }      from "./monochrome";

// ── UI color palettes ─────────────────────────────────────────────────────────
// Each value is a space-separated RGB triple (no `rgb()` wrapper).
// This lets Tailwind opacity modifiers work: `bg-editor-bg/50` → `rgb(var(--c-bg) / 0.5)`
// In plain CSS/inline styles use: `rgb(var(--c-bg))` or `color-mix(...)` as needed.

export interface UiVars {
  bg:        string; // main editor area background
  sidebar:   string; // sidebar / panel background
  deep:      string; // home screen / canvas (darkest)
  header:    string; // title bar / file tree header
  border:    string; // dividers and borders
  line:      string; // active line / hover highlight
  selection: string; // text selection
  gutter:    string; // line number gutter text
  fg:        string; // primary foreground
  comment:   string; // dimmed / secondary text
  red:       string;
  orange:    string;
  yellow:    string;
  green:     string;
  cyan:      string;
  blue:      string;
  purple:    string;
  accent:    string; // primary accent (cursor, active, links)
}

interface ThemeEntry { cm: Extension; ui: UiVars; }

const themes: Record<string, ThemeEntry> = {
  atomDark: {
    cm: atomDark,
    ui: {
      bg:        "40 44 52",
      sidebar:   "33 37 43",
      deep:      "24 27 33",
      header:    "28 31 38",
      border:    "24 26 31",
      line:      "44 49 58",
      selection: "62 68 81",
      gutter:    "75 82 99",
      fg:        "171 178 191",
      comment:   "92 99 112",
      red:       "224 108 117",
      orange:    "209 154 102",
      yellow:    "229 192 123",
      green:     "152 195 121",
      cyan:      "86 182 194",
      blue:      "97 175 239",
      purple:    "198 120 221",
      accent:    "82 139 255",
    },
  },

  dracula: {
    cm: dracula,
    ui: {
      bg:        "40 42 54",
      sidebar:   "33 34 44",
      deep:      "25 26 38",
      header:    "25 26 38",
      border:    "25 26 38",
      line:      "49 51 65",
      selection: "68 71 90",
      gutter:    "98 114 164",
      fg:        "248 248 242",
      comment:   "98 114 164",
      red:       "255 85 85",
      orange:    "255 184 108",
      yellow:    "241 250 140",
      green:     "80 250 123",
      cyan:      "139 233 253",
      blue:      "98 114 164",
      purple:    "189 147 249",
      accent:    "189 147 249",
    },
  },

  nord: {
    cm: nord,
    ui: {
      bg:        "46 52 64",
      sidebar:   "39 44 54",
      deep:      "33 38 49",
      header:    "37 42 50",
      border:    "37 42 50",
      line:      "59 66 82",
      selection: "67 76 94",
      gutter:    "76 86 106",
      fg:        "216 222 233",
      comment:   "97 110 136",
      red:       "191 97 106",
      orange:    "208 135 112",
      yellow:    "235 203 139",
      green:     "163 190 140",
      cyan:      "136 192 208",
      blue:      "129 161 193",
      purple:    "180 142 173",
      accent:    "94 129 172",
    },
  },

  tokyoNight: {
    cm: tokyoNight,
    ui: {
      bg:        "26 27 38",
      sidebar:   "22 22 30",
      deep:      "16 16 24",
      header:    "19 19 29",
      border:    "19 19 29",
      line:      "30 32 48",
      selection: "40 52 87",
      gutter:    "59 66 97",
      fg:        "192 202 245",
      comment:   "86 95 137",
      red:       "247 118 142",
      orange:    "255 158 100",
      yellow:    "224 175 104",
      green:     "158 206 106",
      cyan:      "125 207 255",
      blue:      "122 162 247",
      purple:    "157 124 216",
      accent:    "122 162 247",
    },
  },

  monokai: {
    cm: monokai,
    ui: {
      bg:        "39 40 34",
      sidebar:   "30 31 28",
      deep:      "22 23 20",
      header:    "28 29 25",
      border:    "22 23 20",
      line:      "45 46 39",
      selection: "73 72 62",
      gutter:    "117 113 94",
      fg:        "248 248 242",
      comment:   "117 113 94",
      red:       "249 38 114",
      orange:    "253 151 31",
      yellow:    "230 219 116",
      green:     "166 226 46",
      cyan:      "102 217 232",
      blue:      "102 217 232",
      purple:    "174 129 255",
      accent:    "166 226 46",
    },
  },

  gruvboxDark: {
    cm: gruvboxDark,
    ui: {
      bg:        "40 40 40",
      sidebar:   "29 32 33",
      deep:      "21 21 21",
      header:    "29 32 33",
      border:    "60 56 54",
      line:      "50 48 47",
      selection: "80 73 69",
      gutter:    "102 92 84",
      fg:        "235 219 178",
      comment:   "146 131 116",
      red:       "251 73 52",
      orange:    "254 128 25",
      yellow:    "250 189 47",
      green:     "184 187 38",
      cyan:      "142 192 124",
      blue:      "131 165 152",
      purple:    "211 134 155",
      accent:    "250 189 47",
    },
  },

  catppuccinMocha: {
    cm: catppuccinMocha,
    ui: {
      bg:        "30 30 46",
      sidebar:   "24 24 37",
      deep:      "17 17 27",
      header:    "24 24 37",
      border:    "49 50 68",
      line:      "49 50 68",
      selection: "69 71 90",
      gutter:    "88 91 112",
      fg:        "205 214 244",
      comment:   "108 112 134",
      red:       "243 139 168",
      orange:    "250 179 135",
      yellow:    "249 226 175",
      green:     "166 227 161",
      cyan:      "148 226 213",
      blue:      "137 180 250",
      purple:    "203 166 247",
      accent:    "203 166 247",
    },
  },

  githubDark: {
    cm: githubDark,
    ui: {
      bg:        "13 17 23",
      sidebar:   "22 27 34",
      deep:      "1 4 9",
      header:    "22 27 34",
      border:    "48 54 61",
      line:      "22 27 34",
      selection: "38 79 120",
      gutter:    "72 79 88",
      fg:        "230 237 243",
      comment:   "139 148 158",
      red:       "255 123 114",
      orange:    "255 166 87",
      yellow:    "227 179 65",
      green:     "126 231 135",
      cyan:      "57 197 207",
      blue:      "121 192 255",
      purple:    "210 168 255",
      accent:    "88 166 255",
    },
  },

  rosePine: {
    cm: rosePine,
    ui: {
      bg:        "25 23 36",
      sidebar:   "31 29 46",
      deep:      "16 15 28",
      header:    "31 29 46",
      border:    "38 35 58",
      line:      "38 35 58",
      selection: "64 61 82",
      gutter:    "82 79 103",
      fg:        "224 222 244",
      comment:   "110 106 134",
      red:       "235 111 146",
      orange:    "235 188 186",
      yellow:    "246 193 119",
      green:     "49 116 143",
      cyan:      "156 207 216",
      blue:      "196 167 231",
      purple:    "196 167 231",
      accent:    "235 111 146",
    },
  },

  palenight: {
    cm: palenight,
    ui: {
      bg:        "41 45 62",
      sidebar:   "33 35 54",
      deep:      "25 27 44",
      header:    "33 35 54",
      border:    "28 31 43",
      line:      "49 54 75",
      selection: "68 75 106",
      gutter:    "103 110 149",
      fg:        "166 172 205",
      comment:   "103 110 149",
      red:       "240 113 120",
      orange:    "247 140 108",
      yellow:    "255 203 107",
      green:     "195 232 141",
      cyan:      "137 221 255",
      blue:      "130 170 255",
      purple:    "199 146 234",
      accent:    "130 170 255",
    },
  },

  crimson: {
    cm: crimson,
    ui: {
      bg:        "26 10 10",
      sidebar:   "18 6 6",
      deep:      "10 2 2",
      header:    "20 8 8",
      border:    "46 16 16",
      line:      "38 14 14",
      selection: "74 26 26",
      gutter:    "107 58 58",
      fg:        "240 208 208",
      comment:   "122 64 64",
      red:       "229 23 63",
      orange:    "232 114 74",
      yellow:    "232 184 74",
      green:     "126 200 106",
      cyan:      "92 200 192",
      blue:      "122 172 220",
      purple:    "200 122 184",
      accent:    "229 23 63",
    },
  },

  ayuDark: {
    cm: ayuDark,
    ui: {
      bg:        "13 16 23",
      sidebar:   "10 12 18",
      deep:      "6 8 12",
      header:    "10 12 18",
      border:    "26 33 48",
      line:      "19 23 33",
      selection: "39 55 71",
      gutter:    "61 75 92",
      fg:        "191 189 182",
      comment:   "92 103 115",
      red:       "240 113 120",
      orange:    "255 143 64",
      yellow:    "230 180 80",
      green:     "127 217 98",
      cyan:      "149 230 203",
      blue:      "89 194 255",
      purple:    "210 166 255",
      accent:    "230 180 80",
    },
  },

  oneDark: {
    cm: oneDark,
    ui: {
      bg:        "40 44 52",
      sidebar:   "33 37 43",
      deep:      "21 25 31",
      header:    "33 37 43",
      border:    "62 68 81",
      line:      "44 49 60",
      selection: "62 68 81",
      gutter:    "75 82 99",
      fg:        "171 178 191",
      comment:   "92 99 112",
      red:       "224 108 117",
      orange:    "209 154 102",
      yellow:    "229 192 123",
      green:     "152 195 121",
      cyan:      "86 182 194",
      blue:      "97 175 239",
      purple:    "198 120 221",
      accent:    "82 139 255",
    },
  },

  kanagawa: {
    cm: kanagawa,
    ui: {
      bg:        "31 31 40",
      sidebar:   "22 22 29",
      deep:      "15 15 20",
      header:    "22 22 29",
      border:    "42 42 55",
      line:      "42 42 55",
      selection: "45 79 103",
      gutter:    "84 84 109",
      fg:        "211 199 186",
      comment:   "114 113 105",
      red:       "195 64 67",
      orange:    "255 160 102",
      yellow:    "192 163 110",
      green:     "118 148 106",
      cyan:      "106 149 137",
      blue:      "126 156 216",
      purple:    "149 127 184",
      accent:    "195 64 67",
    },
  },

  monochrome: {
    cm: monochrome,
    ui: {
      bg:        "10 10 10",
      sidebar:   "6 6 6",
      deep:      "0 0 0",
      header:    "8 8 8",
      border:    "30 30 30",
      line:      "20 20 20",
      selection: "42 42 42",
      gutter:    "68 68 68",
      fg:        "232 232 232",
      comment:   "85 85 85",
      red:       "200 200 200",
      orange:    "180 180 180",
      yellow:    "210 210 210",
      green:     "170 170 170",
      cyan:      "190 190 190",
      blue:      "160 160 160",
      purple:    "150 150 150",
      accent:    "255 255 255",
    },
  },

  everforest: {
    cm: everforest,
    ui: {
      bg:        "39 46 51",
      sidebar:   "30 35 38",
      deep:      "20 25 28",
      header:    "30 35 38",
      border:    "55 66 71",
      line:      "46 56 60",
      selection: "55 66 71",
      gutter:    "74 85 91",
      fg:        "211 198 170",
      comment:   "92 106 114",
      red:       "230 126 128",
      orange:    "230 152 117",
      yellow:    "219 188 127",
      green:     "167 192 128",
      cyan:      "131 192 146",
      blue:      "127 187 179",
      purple:    "214 153 182",
      accent:    "167 192 128",
    },
  },
};

// ── Full-dark overrides ───────────────────────────────────────────────────────
// When fullDark is enabled every background slot becomes near-black.
// Foreground, accent, and semantic colors stay from the chosen theme so
// syntax highlighting and UI icons keep their personality.
const FULL_DARK: Pick<UiVars, "bg"|"sidebar"|"deep"|"header"|"border"|"line"|"selection"> = {
  bg:        "8 8 8",
  sidebar:   "5 5 5",
  deep:      "0 0 0",
  header:    "4 4 4",
  border:    "26 26 26",
  line:      "16 16 16",
  selection: "42 42 42",
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getTheme(name: string): Extension {
  return (themes[name] ?? themes.atomDark).cm;
}

export function applyThemeVars(name: string, fullDark = false): void {
  const ui = (themes[name] ?? themes.atomDark).ui;
  const bg = fullDark ? { ...ui, ...FULL_DARK } : ui;
  const root = document.documentElement;
  root.style.setProperty("--c-bg",        bg.bg);
  root.style.setProperty("--c-sidebar",   bg.sidebar);
  root.style.setProperty("--c-deep",      bg.deep);
  root.style.setProperty("--c-header",    bg.header);
  root.style.setProperty("--c-border",    bg.border);
  root.style.setProperty("--c-line",      bg.line);
  root.style.setProperty("--c-selection", bg.selection);
  root.style.setProperty("--c-gutter",    ui.gutter);
  root.style.setProperty("--c-fg",        ui.fg);
  root.style.setProperty("--c-comment",   ui.comment);
  root.style.setProperty("--c-red",       ui.red);
  root.style.setProperty("--c-orange",    ui.orange);
  root.style.setProperty("--c-yellow",    ui.yellow);
  root.style.setProperty("--c-green",     ui.green);
  root.style.setProperty("--c-cyan",      ui.cyan);
  root.style.setProperty("--c-blue",      ui.blue);
  root.style.setProperty("--c-purple",    ui.purple);
  root.style.setProperty("--c-accent",    ui.accent);
}

export const THEME_OPTIONS = [
  { label: "Atom Dark",        value: "atomDark"        },
  { label: "One Dark",         value: "oneDark"         },
  { label: "Dracula",          value: "dracula"         },
  { label: "Nord",             value: "nord"            },
  { label: "Tokyo Night",      value: "tokyoNight"      },
  { label: "Kanagawa",         value: "kanagawa"        },
  { label: "Monokai",          value: "monokai"         },
  { label: "Gruvbox Dark",     value: "gruvboxDark"     },
  { label: "Everforest",       value: "everforest"      },
  { label: "Catppuccin Mocha", value: "catppuccinMocha" },
  { label: "GitHub Dark",      value: "githubDark"      },
  { label: "Rose Pine",        value: "rosePine"        },
  { label: "Palenight",        value: "palenight"       },
  { label: "Ayu Dark",         value: "ayuDark"         },
  { label: "Crimson",          value: "crimson"         },
  { label: "Monochrome",       value: "monochrome"      },
];
