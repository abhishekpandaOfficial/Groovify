import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleMusicSearchRequest } from "./api/_music.js";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "groovify-music-search-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/music-search")) {
            next();
            return;
          }
          await handleMusicSearchRequest(req, res);
        });
      },
    },
  ],
});
