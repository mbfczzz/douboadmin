import { lazy, Suspense, useEffect, useState } from "react";
import { api, type Config } from "./api";
import { useResource } from "./hooks/useResource";
import LoadBoundary from "./components/LoadBoundary";
import Login from "./pages/Login";
import type { Me } from "./session";
const Workspace = lazy(() => import("./Workspace"));
export default function App() {
  const [me, setMe] = useState<Me | null>(null),
    [checking, setChecking] = useState(true);
  const logged = me !== null;
  const loadMe = (signal?: AbortSignal) =>
    api<Me>("/admin/me", { signal }).then((value) => {
      if (!signal?.aborted) setMe(value);
    });
  const config = useResource<Config>("/config");
  useEffect(() => {
    const controller = new AbortController();
    loadMe(controller.signal)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    const expired = () => setMe(null);
    // Menus follow role changes made while this tab is open.
    const refresh = () => {
      if (document.visibilityState === "visible") void loadMe().catch(() => {});
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("permissions-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("permissions-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (checking)
    return (
      <div className="login">
        <p>正在连接豆播管理台…</p>
      </div>
    );
  if (!logged)
    return (
      <Login
        onSuccess={() => {
          void loadMe().catch(() => {});
          void config.reload();
        }}
      />
    );
  return (
    <LoadBoundary>
      <Suspense fallback={<div className="login">正在加载工作台…</div>}>
        <Workspace config={config.data} me={me} onLogout={() => setMe(null)} />
      </Suspense>
    </LoadBoundary>
  );
}
