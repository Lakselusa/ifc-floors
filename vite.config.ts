import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Trimble Connect loads the extension in an iframe over HTTPS, so dev needs TLS too.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  build: { outDir: "dist" },
});
