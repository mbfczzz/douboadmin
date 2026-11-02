import { lazy, Suspense, useEffect, useState } from "react";
import { api, type Config } from "./api";
import { useResource } from "./hooks/useResource";
import LoadBoundary from "./components/LoadBoundary";
import Login from "./pages/Login";
const Workspace = lazy(() => import("./Workspace"));
export default function App() {
  const [logged, setLogged] = useState(false),
    [checking, setChecking] = useState(true);
  const config = useResource<Config>("/config");
  useEffect(() => {
    const controller = new AbortController();
    api("/admin/overview", { signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) setLogged(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    const expired = () => setLogged(false);
    window.addEventListener("session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", expired);
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
          setLogged(true);
          void config.reload();
        }}
      />
    );
  return (
    <LoadBoundary>
      <Suspense fallback={<div className="login">正在加载工作台…</div>}>
        <Workspace config={config.data} onLogout={() => setLogged(false)} />
      </Suspense>
    </LoadBoundary>
  );
}
