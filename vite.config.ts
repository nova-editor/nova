import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // Desktop app — bundle size doesn't affect load time (loaded from disk).
    // Raise limit to suppress the warning; we still chunk to keep DevTools readable.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@codemirror") || id.includes("@lezer") || id.includes("codemirror")) {
            return "codemirror";
          }
          if (id.includes("@xterm")) {
            return "xterm";
          }
          if (id.includes("@iconify") || id.includes("iconify-json")) {
            return "icons";
          }
          if (id.includes("@tauri-apps")) {
            return "tauri";
          }
          if (id.includes("node_modules/react")) {
            return "react";
          }
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
}));
