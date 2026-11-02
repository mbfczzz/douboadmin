import { lazy, Suspense, useRef, useEffect, useState } from "react";
import { LogOut, Menu, ChevronRight, X } from "lucide-react";
import { api, type Config } from "./api";
import { pageInfo, navGroups, type PageId } from "./navigation";
import LoadBoundary from "./components/LoadBoundary";
import { usePage } from "./hooks/usePage";
import { useDrawer } from "./hooks/useDrawer";
import { canLeave } from "./hooks/unsaved";
const routes = {
  overview: lazy(() => import("./pages/Overview")),
  templates: lazy(() => import("./pages/Templates")),
  jobs: lazy(() => import("./pages/Jobs")),
  users: lazy(() => import("./pages/Users")),
  models: lazy(() => import("./pages/Models")),
  feedback: lazy(() => import("./pages/Feedback")),
  settings: lazy(() => import("./pages/Settings")),
  works: lazy(() => import("./pages/Works")),
  reviews: lazy(() => import("./pages/Reviews")),
  orders: lazy(() => import("./pages/Orders")),
  payments: lazy(() => import("./pages/Payments")),
  monitor: lazy(() => import("./pages/Monitor")),
};
export default function Workspace({
  config,
  onLogout,
}: {
  config?: Config;
  onLogout: () => void;
}) {
  const [page, setPage] = usePage(),
    { open: mobile, setOpen: setMobile, closeButton } = useDrawer(),
    [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = (message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 3500);
  };
  const navigate = (id: PageId) => {
    setPage(id);
    setMobile(false);
  };
  const CurrentPage = routes[page];
  async function logout() {
    if (!canLeave()) return;
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className={page === "monitor" ? "app monitor-open" : "app"}>
      {mobile && (
        <div
          className="nav-backdrop"
          aria-hidden="true"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={mobile ? "sidebar open" : "sidebar"}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        aria-label="工作空间导航"
      >
        <button
          ref={closeButton}
          className="icon mobile-toggle drawer-close"
          aria-label="关闭菜单"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="brand">
          <span>豆</span>
          <div>
            豆播 AI<small>创作管理工作台</small>
          </div>
        </div>
        <nav aria-label="管理栏目">
          {navGroups.map((group) => (
            <section key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.pages.map((id) => {
                const Icon = pageInfo[id][2];
                return (
                  <button
                    key={id}
                    className={page === id ? "active" : ""}
                    aria-current={page === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={18} />
                    {pageInfo[id][0]}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" />
          {config?.relayConfigured ? "中转服务已配置" : "中转服务未配置"}
          <button onClick={logout}>
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>
      <main className="main" inert={mobile}>
        <header className="topbar">
          <button
            className="icon mobile-toggle"
            aria-label="切换菜单"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <span>
            管理后台 <ChevronRight size={14} />
            {pageInfo[page][0]}
          </span>
          <div>
            <span className="avatar">管</span>
            <b>管理员</b>
          </div>
        </header>
        <div className="content">
          <LoadBoundary key={page}>
            <Suspense fallback={<p role="status">正在加载页面…</p>}>
              <CurrentPage
                config={config}
                notify={notify}
                navigate={navigate}
              />
            </Suspense>
          </LoadBoundary>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
