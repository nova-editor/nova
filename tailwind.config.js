/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        editor: {
          bg:        "rgb(var(--c-bg)        / <alpha-value>)",
          sidebar:   "rgb(var(--c-sidebar)   / <alpha-value>)",
          deep:      "rgb(var(--c-deep)      / <alpha-value>)",
          border:    "rgb(var(--c-border)    / <alpha-value>)",
          line:      "rgb(var(--c-line)      / <alpha-value>)",
          selection: "rgb(var(--c-selection) / <alpha-value>)",
          gutter:    "rgb(var(--c-gutter)    / <alpha-value>)",
          fg:        "rgb(var(--c-fg)        / <alpha-value>)",
          comment:   "rgb(var(--c-comment)   / <alpha-value>)",
          red:       "rgb(var(--c-red)       / <alpha-value>)",
          orange:    "rgb(var(--c-orange)    / <alpha-value>)",
          yellow:    "rgb(var(--c-yellow)    / <alpha-value>)",
          green:     "rgb(var(--c-green)     / <alpha-value>)",
          cyan:      "rgb(var(--c-cyan)      / <alpha-value>)",
          blue:      "rgb(var(--c-blue)      / <alpha-value>)",
          purple:    "rgb(var(--c-purple)    / <alpha-value>)",
          accent:    "rgb(var(--c-accent)    / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": "0.65rem",
      },
    },
  },
  plugins: [],
};
