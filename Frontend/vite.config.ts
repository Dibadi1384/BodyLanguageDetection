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

    // Helper function to create proxy config with error handling
    const createProxyConfig = (path: string) => ({
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      // Handle connection errors gracefully during backend restarts
      configure: (proxy: any, _options: any) => {
        proxy.on('error', (err: any, req: any, res: any) => {
          // Only log if it's not a connection refused error (backend restarting)
          if (err.code !== 'ECONNREFUSED') {
            console.error(`[Vite Proxy Error] ${path}:`, err.message);
          }
          // Return a proper error response instead of crashing
          if (!res.headersSent) {
            res.writeHead(502, {
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({
              error: 'Backend server is temporarily unavailable. Please wait a moment and try again.',
              code: 'BACKEND_UNAVAILABLE'
            }));
          }
        });
        // Handle proxy response errors
        proxy.on('proxyRes', (proxyRes: any, req: any, res: any) => {
          // Log non-2xx responses for debugging (optional)
          if (proxyRes.statusCode >= 500) {
            console.warn(`[Vite Proxy] ${path} returned ${proxyRes.statusCode}`);
          }
        });
      },
      // Retry configuration for better resilience
      ws: true, // Enable WebSocket proxying
    });

    return {
      host: "::",
      port: 8080,
      proxy: {
        // Proxy API calls to the backend
        "/api": createProxyConfig("/api"),
        // Proxy upload and video endpoints directly
        "/upload": createProxyConfig("/upload"),
        "/videos": createProxyConfig("/videos"),
        "/status": createProxyConfig("/status"),
        "/thumbnail": createProxyConfig("/thumbnail"),
        "/uploads": createProxyConfig("/uploads"),
        "/work": createProxyConfig("/work"),
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
