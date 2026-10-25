import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { SERVER_PORT } from "@hangout/shared";

export default defineConfig({
  plugins: [react()],
  server: {
    // Let `tailscale serve` (https://<machine>.<tailnet>.ts.net) reach the dev server.
    allowedHosts: [".ts.net"],
    // Same-origin route to Colyseus (VITE_SERVER_URL=/colyseus), so phones only need the page's own port.
    proxy: {
      "/colyseus": { target: `http://127.0.0.1:${SERVER_PORT}`, ws: true, rewrite: (p) => p.replace(/^\/colyseus/, "") },
    },
  },
});
