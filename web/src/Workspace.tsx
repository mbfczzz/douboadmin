import { lazy, Suspense, useRef, useEffect, useMemo, useState } from "react";
import { LogOut, Menu, ChevronRight, Search, X } from "lucide-react";
import { api, type Config } from "./api";
import {
  pageInfo,
  groupsFor,
  type NoticeTone,
  type PageId,
} from "./navigation";
import LoadBoundary from "./components/LoadBoundary";
import { LoadingState } from "./components/RequestState";
import { usePage } from "./hooks/usePage";
import { useDrawer } from "./hooks/useDrawer";
import { canLeave } from "./hooks/unsaved";
import ConfirmationHost from "./confirmation/Host";
import AskHost from "./confirm/AskHost";
import AccountMenu from "./components/AccountMenu";
import { presetActor } from "./logs/preset";
import { MeContext, type Me } from "./session";
import { confirmationPending } from "./confirmation/request";
const routes = {
  overview: lazy(() => import("./pages/Overview")),
  templates: lazy(() => import("./pages/Templates")),
  jobs: lazy(() => import("./pages/Jobs")),
  users: lazy(() => import("./pages/Users")),
  partners: lazy(() => import("./partners/Hub")),
  accounts: lazy(() => import("./pages/AdminAccounts")),
  roles: lazy(() => import("./pages/Roles")),
  models: lazy(() => import("./pages/Models")),
  feedback: lazy(() => import("./pages/Feedback")),
  settings: lazy(() => import("./pages/Settings")),
  works: lazy(() => import("./pages/Works")),
  orders: lazy(() => import("./pages/Orders")),
  payments: lazy(() => import("./pages/Payments")),
  monitor: lazy(() => import("./pages/Monitor")),
  logs: lazy(() => import("./pages/Logs")),
};
const CommandPalette = lazy(() => import("./components/CommandPalette"));
export default function Workspace({
  config,
  me,
  onLogout,
}: {
  config?: Config;
  me: Me;
  onLogout: () => void;
}) {
  const [page, setPage] = usePage(),
    groups = useMemo(() => groupsFor(me.menus), [me.menus]),
    allowed = useMemo(() => groups.flatMap((group) => group.pages), [groups]),
    { open: mobile, setOpen: setMobile, closeButton } = useDrawer(),
    [commandOpen, setCommandOpen] = useState(false),
    [recent, setRecent] = useState<PageId[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("doubo-recent-pages") || "[]");
      } catch {
        return [];
      }
    }),
    [toast, setToast] = useState<{
      message: string;
      tone: NoticeTone;
    }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!confirmationPending()) setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  const notify = (message: string, tone: NoticeTone = "success") => {
    if (!message) return;
    clearTimeout(timer.current);
    setToast({ message, tone });
    if (tone !== "error")
      timer.current = setTimeout(
        () => setToast(undefined),
        tone === "warning" ? 6000 : 3500,
      );
  };
  const navigate = (id: PageId) => {
    // Shortcuts to pages outside the role's menus explain instead of bouncing.
    if (!allowed.includes(id)) {
      notify("当前角色没有该页面的访问权限，请联系超级管理员", "warning");
      return;
    }
    if (id !== page) {
      const next = [page, ...recent.filter((value) => value !== page)].slice(
        0,
        4,
      );
      setRecent(next);
      try {
        localStorage.setItem("doubo-recent-pages", JSON.stringify(next));
      } catch {
        /* Recent pages are optional. */
      }
    }
    setPage(id);
    setMobile(false);
  };
  // Pages outside the role's menus never mount, so they cannot fire requests.
  const CurrentPage = allowed.includes(page) ? routes[page] : null;
  useEffect(() => {
    if (!allowed.includes(page) && allowed[0]) setPage(allowed[0]);
  }, [allowed, page, setPage]);
  async function logout() {
    if (!(await canLeave())) return;
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <MeContext.Provider value={me}>
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
            {groups.map((group) => (
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
            <span
              className={config?.relayConfigured ? "live-dot" : "live-dot off"}
            />
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
              <button
                className="secondary command-trigger"
                aria-label="快速跳转"
                title="快速跳转（Ctrl / Command + K）"
                onClick={() => setCommandOpen(true)}
              >
                <Search size={15} />
                <span>快速跳转</span>
                <kbd>Ctrl K</kbd>
              </button>
              <AccountMenu
                me={me}
                notify={notify}
                onLogs={
                  me.menus.includes("logs")
                    ? () => {
                        presetActor(me.account || me.id);
                        navigate("logs");
                      }
                    : undefined
                }
                onLogout={() => void logout()}
              />
            </div>
          </header>
          <div className="content">
            <LoadBoundary key={page}>
              <Suspense fallback={<LoadingState label="正在加载页面" />}>
                {CurrentPage && (
                  <CurrentPage
                    config={config}
                    notify={notify}
                    navigate={navigate}
                  />
                )}
              </Suspense>
            </LoadBoundary>
          </div>
        </main>
        {commandOpen && (
          <Suspense fallback={null}>
            <CommandPalette
              current={page}
              recent={recent.filter((id) => allowed.includes(id))}
              groups={groups}
              onChoose={navigate}
              onClose={() => setCommandOpen(false)}
            />
          </Suspense>
        )}
        {toast && (
          <div
            className={"toast " + toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <span>{toast.message}</span>
            <button aria-label="关闭通知" onClick={() => setToast(undefined)}>
              <X size={16} />
            </button>
          </div>
        )}
        <ConfirmationHost />
        <AskHost />
      </div>
    </MeContext.Provider>
  );
}
