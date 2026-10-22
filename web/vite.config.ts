import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const api = "http://localhost:4000";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": api,
      "/uploads": api,
      "/socket.io": { target: api, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ["three", "@react-three/fiber"], motion: ["framer-motion"] } },
    },
  },
});
