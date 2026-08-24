import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: "0.0.0.0",

    proxy: {
      "/api/camera/capture": {
        target: "http://192.168.11.7:5000",
        changeOrigin: true,

        rewrite: () => "/capture",

        headers: {
          Authorization: "Bearer snack-camera-2026-test",
        },
      },

      "/realtime": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/realtime/, ""),
      },
    },
  },
});
