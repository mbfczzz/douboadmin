import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const webDirectory = fileURLToPath(new URL(".", import.meta.url));
// Keep common UI helpers together; route components still load independently.
const sharedModules = [
  // JobTable is used by 生成任务 only and pulls that page's recovery helpers,
  // so it stays with the page rather than dragging it into every page.
  /src[\\/]components[\\/](Badge|StatusBadge|Empty|FilterBar|Modal|PageHeader|RequestState|Pagination)/,
  /src[\\/]business[\\/](Table|ResourcePage|MediaPreview|types)/,
  /src[\\/]models[\\/]settings\.ts/,
  /src[\\/]hooks[\\/](useRememberedState|useRecordSave)/,
];
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, webDirectory, "DOUBO_");
  const target =
    process.env.DOUBO_API_TARGET ||
    environment.DOUBO_API_TARGET ||
    "http://127.0.0.1:5173";
  const upstream = { target, changeOrigin: false };
  const proxy = {
    "/api": upstream,
    "/media": upstream,
    "^/s/": upstream,
    "/health": upstream,
  };
  return {
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
  };
});
