// vite.config.js
import { defineConfig } from "file:///C:/Users/basse/Dropbox/Bassem%20Askari/ChatGPT/Empire-Rise/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/basse/Dropbox/Bassem%20Askari/ChatGPT/Empire-Rise/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
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
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxiYXNzZVxcXFxEcm9wYm94XFxcXEJhc3NlbSBBc2thcmlcXFxcQ2hhdEdQVFxcXFxFbXBpcmUtUmlzZVxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYmFzc2VcXFxcRHJvcGJveFxcXFxCYXNzZW0gQXNrYXJpXFxcXENoYXRHUFRcXFxcRW1waXJlLVJpc2VcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2Jhc3NlL0Ryb3Bib3gvQmFzc2VtJTIwQXNrYXJpL0NoYXRHUFQvRW1waXJlLVJpc2UvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiXHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIlxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBob3N0OiB0cnVlLFxyXG4gICAgcG9ydDogNTE3NCxcclxuICAgIHN0cmljdFBvcnQ6IHRydWUsXHJcbiAgICBwcm94eToge1xyXG4gICAgICBcIi9hcGlcIjogXCJodHRwOi8vMTI3LjAuMC4xOjg3ODdcIixcclxuICAgICAgXCIvYXV0aFwiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiLFxyXG4gICAgICBcIi9vYXV0aFwiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiLFxyXG4gICAgICBcIi93ZWJob29rc1wiOiBcImh0dHA6Ly8xMjcuMC4wLjE6ODc4N1wiXHJcbiAgICB9LFxyXG4gICAgaG1yOiB7XHJcbiAgICAgIHByb3RvY29sOiBcIndzXCIsXHJcbiAgICAgIGhvc3Q6IFwibG9jYWxob3N0XCIsXHJcbiAgICAgIHBvcnQ6IDUxNzQsXHJcbiAgICAgIGNsaWVudFBvcnQ6IDUxNzRcclxuICAgIH1cclxuICB9XHJcbn0pIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF1WSxTQUFTLG9CQUFvQjtBQUNwYSxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxJQUNmO0FBQUEsSUFDQSxLQUFLO0FBQUEsTUFDSCxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
