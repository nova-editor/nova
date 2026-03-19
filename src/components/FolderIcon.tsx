import { Icon } from "@iconify/react";

interface Props { name: string; open?: boolean; size?: number }

// Only slugs that actually exist in vscode-icons
const FOLDER_MAP: Record<string, string> = {
  // Source / app structure
  src:          "src",
  source:       "src",
  app:          "app",
  shared:       "shared",
  common:       "common",
  helper:       "helper",
  helpers:      "helper",
  hook:         "hook",
  hooks:        "hook",
  types:        "typescript",
  interfaces:   "typescript",
  model:        "model",
  models:       "model",
  // Components / UI
  component:    "component",
  components:   "component",
  view:         "view",
  views:        "view",
  layout:       "layout",
  layouts:      "layout",
  // Assets
  public:       "public",
  images:       "image",
  img:          "image",
  image:        "image",
  fonts:        "fonts",
  font:         "fonts",
  audio:        "audio",
  video:        "video",
  // Build / output
  dist:         "dist",
  target:       "cargo",      // Rust target → cargo folder
  bin:          "binary",
  // Config / infra
  config:       "config",
  configs:      "config",
  configuration:"config",
  ".config":    "config",
  // Tests
  test:         "test",
  tests:        "test",
  __tests__:    "test",
  spec:         "test",
  specs:        "test",
  e2e:          "e2e",
  coverage:     "coverage",
  // Docs
  docs:         "docs",
  doc:          "docs",
  documentation:"docs",
  wiki:         "docs",
  // Package managers / dependencies
  node_modules: "node",
  ".yarn":      "yarn",
  ".pnpm":      "pnpm",
  // Version control / CI
  ".git":       "git",
  ".github":    "github",
  ".gitlab":    "gitlab",
  ".vscode":    "vscode",
  ".husky":     "husky",
  docker:       "docker",
  kubernetes:   "kubernetes",
  k8s:          "kubernetes",
  // Rust / Tauri
  "src-tauri":  "tauri",
  tauri:        "tauri",
  crates:       "cargo",
  cargo:        "cargo",
  // Database / API
  migrations:   "db",
  migration:    "db",
  database:     "db",
  db:           "db",
  sql:          "db",
  seeds:        "db",
  route:        "route",
  routes:       "route",
  api:          "api",
  graphql:      "graphql",
  gql:          "graphql",
  prisma:       "prisma",
  // State / frontend
  store:        "redux",
  stores:       "redux",
  redux:        "redux",
  middleware:   "middleware",
  middlewares:  "middleware",
  server:       "server",
  services:     "services",
  service:      "services",
  controller:   "controller",
  controllers:  "controller",
  plugin:       "plugin",
  plugins:      "plugin",
  // Misc
  script:       "script",
  scripts:      "script",
  temp:         "temp",
  tmp:          "temp",
  log:          "log",
  logs:         "log",
  mock:         "mock",
  mocks:        "mock",
  locale:       "locale",
  locales:      "locale",
  i18n:         "locale",
  translations: "locale",
  tool:         "tools",
  tools:        "tools",
  library:      "library",
  lib:          "library",
  libs:         "library",
  package:      "package",
  packages:     "package",
  theme:        "theme",
  themes:       "theme",
};

export function FolderIcon({ name, open = false, size = 14 }: Props) {
  const lower = name.toLowerCase();
  const slug  = FOLDER_MAP[lower];

  let icon: string;
  if (slug) {
    const base = `vscode-icons:folder-type-${slug}`;
    icon = open ? `${base}-opened` : base;
  } else {
    icon = open ? "vscode-icons:default-folder-opened" : "vscode-icons:default-folder";
  }

  return <Icon icon={icon} width={size} height={size} style={{ flexShrink: 0, display: "block" }} />;
}
