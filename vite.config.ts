import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Trimble Connect loads the extension in an iframe over HTTPS, so dev needs TLS too.
export default defineConfig({
  plugins: [basicSsl()],
  // Relative asset paths, so the build works at any GitHub Pages sub-path
  // (https://<user>.github.io/<repo>/) without hard-coding the repo name.
  base: "./",
  server: { host: true, port: 5173 },
  build: { outDir: "dist" },
});
