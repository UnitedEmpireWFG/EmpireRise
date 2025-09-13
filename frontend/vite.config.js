import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
      "/oauth": "http://127.0.0.1:8787",
      "/webhooks": "http://127.0.0.1:8787"
    },
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5174,
      clientPort: 5174
    }
  }
})