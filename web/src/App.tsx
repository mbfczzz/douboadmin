import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { api, APIError, type Config } from "./api";
import { useResource } from "./hooks/useResource";
import LoadBoundary from "./components/LoadBoundary";
import Login from "./pages/Login";
import { workspaceScopeKey, type Me } from "./session";
const Workspace = lazy(() => import("./Workspace"));
export default function App() {
  const [me, setMe] = useState<Me | null>(null),
    [checking, setChecking] = useState(true);
  const logged = me !== null;
  const revision = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const clearIdentity = () => {
    revision.current++;
    pending.current?.abort();
    setMe(null);
    setChecking(false);
  };
  const loadMe = async (signal?: AbortSignal) => {
    const current = ++revision.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const value = await api<Me>("/admin/me", { signal: controller.signal });
      if (!controller.signal.aborted && revision.current === current)
        setMe(
          value.role === "super_admin" && value.canManageAccounts !== false
            ? value
            : { ...value, menus: ["partners"] },
        );
    } catch (error) {
      if (
        revision.current === current &&
        !controller.signal.aborted &&
        error instanceof APIError &&
        (error.status === 401 || error.status === 403)
      )
        clearIdentity();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted && revision.current === current)
        setChecking(false);
    }
  };
  const config = useResource<Config>("/config");
  useEffect(() => {
    const controller = new AbortController();
    void loadMe(controller.signal).catch(() => {});
    const expired = clearIdentity;
    // Menus follow role changes made while this tab is open.
    const refresh = () => {
      if (document.visibilityState === "visible") void loadMe().catch(() => {});
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("permissions-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      revision.current++;
      pending.current?.abort();
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
        <Workspace
          key={workspaceScopeKey(me)}
          config={me.role === "super_admin" ? config.data : undefined}
          me={me}
          onLogout={clearIdentity}
        />
      </Suspense>
    </LoadBoundary>
  );
}
