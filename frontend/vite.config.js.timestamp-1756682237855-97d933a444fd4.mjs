// vite.config.js
import { defineConfig } from "file:///C:/Users/basse/Dropbox/Bassem%20Askari/ChatGPT/Empire-Rise/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/basse/Dropbox/Bassem%20Askari/ChatGPT/Empire-Rise/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/oauth": "http://127.0.0.1:8787",
      "/webhooks": "http://127.0.0.1:8787"
    }
  },
  assetsInclude: ["**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.svg"]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxiYXNzZVxcXFxEcm9wYm94XFxcXEJhc3NlbSBBc2thcmlcXFxcQ2hhdEdQVFxcXFxFbXBpcmUtUmlzZVxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYmFzc2VcXFxcRHJvcGJveFxcXFxCYXNzZW0gQXNrYXJpXFxcXENoYXRHUFRcXFxcRW1waXJlLVJpc2VcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2Jhc3NlL0Ryb3Bib3gvQmFzc2VtJTIwQXNrYXJpL0NoYXRHUFQvRW1waXJlLVJpc2UvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBvcGVuOiBmYWxzZSxcclxuICAgIHByb3h5OiB7XHJcbiAgICAgIFwiL2FwaVwiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiLFxyXG4gICAgICBcIi9vYXV0aFwiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiLFxyXG4gICAgICBcIi93ZWJob29rc1wiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiXHJcbiAgICB9XHJcbiAgfSxcclxuICBhc3NldHNJbmNsdWRlOiBbXCIqKi8qLnBuZ1wiLFwiKiovKi5qcGdcIixcIioqLyouanBlZ1wiLFwiKiovKi5zdmdcIl1cclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIjtBQUF1WSxTQUFTLG9CQUFvQjtBQUNwYSxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxJQUNmO0FBQUEsRUFDRjtBQUFBLEVBQ0EsZUFBZSxDQUFDLFlBQVcsWUFBVyxhQUFZLFVBQVU7QUFDOUQsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
