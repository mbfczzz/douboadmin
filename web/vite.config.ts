import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const target = process.env.DOUBO_API_TARGET || "http://127.0.0.1:8080";
const upstream = { target, changeOrigin: false };
const proxy = { "/api": upstream, "/media": upstream, "^/s/": upstream };
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "partner-business",
              test: /src[\\/]partners[\\/]/,
              includeDependenciesRecursively: false,
            },
            {
              name: "icons",
              test: /node_modules[\\/]lucide-react/,
              includeDependenciesRecursively: false,
            },
            {
              name: "workspace-common",
              test: /src[\\/]components[\\/](Badge|Empty|JobDetail|JobTable|FilterBar|Modal|PageHeader|RequestState|Pagination)|src[\\/]business[\\/](Table|ResourcePage)/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: { proxy },
  preview: { proxy },
});
