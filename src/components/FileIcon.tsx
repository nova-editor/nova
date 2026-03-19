import { Icon } from "@iconify/react";

interface Props { filename: string; size?: number }

// Match by exact filename first, then by extension
const BY_NAME: Record<string, string> = {
  // Package managers
  "package.json":          "vscode-icons:file-type-node",
  "package-lock.json":     "vscode-icons:file-type-npm",
  "yarn.lock":             "vscode-icons:file-type-yarn",
  "pnpm-lock.yaml":        "vscode-icons:file-type-pnpm",
  "bun.lockb":             "vscode-icons:file-type-bun",
  // Rust
  "cargo.toml":            "vscode-icons:file-type-cargo",
  "cargo.lock":            "vscode-icons:file-type-cargo",
  // Config files
  "vite.config.ts":        "vscode-icons:file-type-vite",
  "vite.config.js":        "vscode-icons:file-type-vite",
  "vite.config.mts":       "vscode-icons:file-type-vite",
  "tailwind.config.ts":    "vscode-icons:file-type-tailwind",
  "tailwind.config.js":    "vscode-icons:file-type-tailwind",
  "tailwind.config.cjs":   "vscode-icons:file-type-tailwind",
  "tsconfig.json":         "vscode-icons:file-type-tsconfig",
  "tsconfig.base.json":    "vscode-icons:file-type-tsconfig",
  "postcss.config.js":     "vscode-icons:file-type-postcss",
  "postcss.config.cjs":    "vscode-icons:file-type-postcss",
  "postcss.config.ts":     "vscode-icons:file-type-postcss",
  ".eslintrc":             "vscode-icons:file-type-eslint",
  ".eslintrc.js":          "vscode-icons:file-type-eslint",
  ".eslintrc.json":        "vscode-icons:file-type-eslint",
  ".eslintrc.yaml":        "vscode-icons:file-type-eslint",
  ".eslintrc.yml":         "vscode-icons:file-type-eslint",
  "eslint.config.js":      "vscode-icons:file-type-eslint",
  "eslint.config.ts":      "vscode-icons:file-type-eslint",
  ".prettierrc":           "vscode-icons:file-type-prettier",
  ".prettierrc.js":        "vscode-icons:file-type-prettier",
  ".prettierrc.json":      "vscode-icons:file-type-prettier",
  "prettier.config.js":    "vscode-icons:file-type-prettier",
  // Git
  ".gitignore":            "vscode-icons:file-type-git",
  ".gitattributes":        "vscode-icons:file-type-git",
  ".gitmodules":           "vscode-icons:file-type-git",
  // Docker
  "dockerfile":            "vscode-icons:file-type-docker",
  "docker-compose.yml":    "vscode-icons:file-type-docker",
  "docker-compose.yaml":   "vscode-icons:file-type-docker",
  ".dockerignore":         "vscode-icons:file-type-docker",
  // CI / Misc
  "makefile":              "vscode-icons:file-type-makefile",
  "license":               "vscode-icons:file-type-license",
  "licence":               "vscode-icons:file-type-license",
  "readme.md":             "vscode-icons:file-type-markdown",
  "changelog.md":          "vscode-icons:file-type-markdown",
  ".env":                  "vscode-icons:file-type-dotenv",
  ".env.local":            "vscode-icons:file-type-dotenv",
  ".env.production":       "vscode-icons:file-type-dotenv",
  ".env.development":      "vscode-icons:file-type-dotenv",
  ".env.example":          "vscode-icons:file-type-dotenv",
  "index.html":            "vscode-icons:file-type-html",
};

const BY_EXT: Record<string, string> = {
  // TypeScript
  ts:       "vscode-icons:file-type-typescript",
  tsx:      "vscode-icons:file-type-reactts",
  mts:      "vscode-icons:file-type-typescript",
  cts:      "vscode-icons:file-type-typescript",
  // JavaScript
  js:       "vscode-icons:file-type-js",
  jsx:      "vscode-icons:file-type-reactjs",
  mjs:      "vscode-icons:file-type-js",
  cjs:      "vscode-icons:file-type-js",
  // Rust
  rs:       "vscode-icons:file-type-rust",
  // Python
  py:       "vscode-icons:file-type-python",
  pyw:      "vscode-icons:file-type-python",
  // Go
  go:       "vscode-icons:file-type-go",
  // Web
  html:     "vscode-icons:file-type-html",
  htm:      "vscode-icons:file-type-html",
  css:      "vscode-icons:file-type-css",
  scss:     "vscode-icons:file-type-scss",
  sass:     "vscode-icons:file-type-scss",
  less:     "vscode-icons:file-type-less",
  // Data / config
  json:     "vscode-icons:file-type-json",
  jsonc:    "vscode-icons:file-type-json",
  json5:    "vscode-icons:file-type-json",
  md:       "vscode-icons:file-type-markdown",
  mdx:      "vscode-icons:file-type-mdx",
  sql:      "vscode-icons:file-type-sql",
  xml:      "vscode-icons:file-type-xml",
  svg:      "vscode-icons:file-type-svg",
  // JVM
  java:     "vscode-icons:file-type-java",
  kt:       "vscode-icons:file-type-kotlin",
  kts:      "vscode-icons:file-type-kotlin",
  class:    "vscode-icons:file-type-class",
  // Systems
  cpp:      "vscode-icons:file-type-cpp",
  cc:       "vscode-icons:file-type-cpp",
  cxx:      "vscode-icons:file-type-cpp",
  c:        "vscode-icons:file-type-c",
  h:        "vscode-icons:file-type-cheader",
  hpp:      "vscode-icons:file-type-cppheader",
  swift:    "vscode-icons:file-type-swift",
  // Scripting
  rb:       "vscode-icons:file-type-ruby",
  php:      "vscode-icons:file-type-php",
  dart:     "vscode-icons:file-type-dartlang",
  lua:      "vscode-icons:file-type-lua",
  // Shell
  sh:       "vscode-icons:file-type-shell",
  bash:     "vscode-icons:file-type-shell",
  zsh:      "vscode-icons:file-type-shell",
  fish:     "vscode-icons:file-type-shell",
  ps1:      "vscode-icons:file-type-powershell",
  // Frontend frameworks
  vue:      "vscode-icons:file-type-vue",
  svelte:   "vscode-icons:file-type-svelte",
  astro:    "vscode-icons:file-type-astro",
  // Config / infra
  toml:     "vscode-icons:file-type-toml",
  yaml:     "vscode-icons:file-type-yaml",
  yml:      "vscode-icons:file-type-yaml",
  env:      "vscode-icons:file-type-dotenv",
  lock:     "vscode-icons:file-type-yarn",
  // Documents
  txt:      "vscode-icons:file-type-text",
  csv:      "vscode-icons:file-type-text",
  pdf:      "vscode-icons:file-type-pdf",
  // Images
  png:      "vscode-icons:file-type-image",
  jpg:      "vscode-icons:file-type-image",
  jpeg:     "vscode-icons:file-type-image",
  gif:      "vscode-icons:file-type-image",
  webp:     "vscode-icons:file-type-image",
  ico:      "vscode-icons:file-type-image",
  // Other
  wasm:     "vscode-icons:file-type-wasm",
  graphql:  "vscode-icons:file-type-graphql",
  gql:      "vscode-icons:file-type-graphql",
  prisma:   "vscode-icons:file-type-prisma",
  proto:    "vscode-icons:file-type-protobuf",
  zip:      "vscode-icons:file-type-zip",
  tar:      "vscode-icons:file-type-zip",
  gz:       "vscode-icons:file-type-zip",
};

const DEFAULT = "vscode-icons:default-file";

export function FileIcon({ filename, size = 16 }: Props) {
  const lower = filename.toLowerCase();
  const ext   = lower.split(".").pop() ?? "";
  const icon  = BY_NAME[lower] ?? BY_EXT[ext] ?? DEFAULT;
  return <Icon icon={icon} width={size} height={size} style={{ flexShrink: 0, display: "block" }} />;
}
