import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const target = process.env.DOUBO_API_TARGET || "http://127.0.0.1:5173";
const upstream = { target, changeOrigin: false };
const proxy = { "/api": upstream, "/media": upstream, "^/s/": upstream };
// Keep common UI helpers together; route components still load independently.
const sharedModules = [
  /src[\\/]components[\\/](Badge|StatusBadge|Empty|JobDetail|JobTable|FilterBar|Modal|PageHeader|RequestState|Pagination)/,
  /src[\\/]business[\\/](Table|ResourcePage|MediaPreview|types)/,
  /src[\\/]models[\\/]settings\.ts/,
  /src[\\/]hooks[\\/](useRememberedState|useRecordSave)/,
];
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    license: { fileName: "THIRD_PARTY_LICENSES.txt" },
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
              test: (id) => sharedModules.some((pattern) => pattern.test(id)),
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: { port: 5174, strictPort: true, proxy },
  preview: { proxy },
});
