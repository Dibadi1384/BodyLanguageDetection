import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: (() => {
    // Determine backend API target:
    // 1. VITE_API_URL env var (if set)
    // 2. Backend/.backend-port file (written by backend on start)
    // 3. Fallback to http://localhost:5000
    let apiTarget = (process.env.VITE_API_URL as string) || '';
    try {
      if (!apiTarget) {
        const portFile = path.resolve(__dirname, '..', 'Backend', '.backend-port');
        if (fs.existsSync(portFile)) {
          const port = fs.readFileSync(portFile, { encoding: 'utf8' }).trim();
          if (port) apiTarget = `http://localhost:${port}`;
        }
      }
    } catch (e) {
      // ignore and fallback
    }

    if (!apiTarget) apiTarget = 'http://localhost:5000';

    return {
      host: "::",
      port: 8080,
      proxy: {
        // Proxy API calls to the backend
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        // Proxy upload and video endpoints directly
        "/upload": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/videos": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/status": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/uploads": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/work": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    };
  })(),
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  css: {
    postcss: "./postcss.config.js",
  },
}));
