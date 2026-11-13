import { sourceLabel, initialSource } from "../users/source";
import Badge from "../components/Badge";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Row } from "../api";
import { useMe, canManageAccounts } from "../session";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import ResourcePage from "../business/ResourcePage";
import PageHeader from "../components/PageHeader";
import ViewTabs from "../users/ViewTabs";
import UserFilters from "../users/UserFilters";
import Table from "../business/Table";
import UserDetails from "../business/UserDetails";
import UserPoints from "../business/UserPoints";
import UserEdit from "../business/UserEdit";
import UserStatus from "../business/UserStatus";
import "../users/users.css";
import { accessCell, createdCell, nameCell } from "../users/cells";

// Record dialogs load when opened, keeping the users list itself light.
const UserModels = lazy(() => import("../users/UserModels"));
const UserActivity = lazy(() => import("../users/UserActivity"));
// Scan registrations awaiting the platform; provider logins never see them.
const Registrations = lazy(() => import("../users/Registrations"));

type Dialog =
  "detail" | "models" | "activity" | "points" | "edit" | "status" | "delete";
import type { Profile } from "../business/types";

// The platform switches between the user list and scan registrations; each
// view loads only its own data.
export default function Users({ notify }: PageProps) {
  const me = useMe(),
    platform = !!me && !me.partnerId,
    [view, setView] = useRememberedState("users.view", "users"),
    tabs = platform ? <ViewTabs view={view} onChange={setView} /> : null;
  return platform && view === "registrations" ? (
    <RegistrationView notify={notify} tabs={tabs} />
  ) : (
    <UserList notify={notify} tabs={tabs} />
  );
}

function RegistrationView({
  notify,
  tabs,
}: Pick<PageProps, "notify"> & { tabs: ReactNode }) {
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="catalog-page">
      <PageHeader page="users" onRefresh={() => setRefresh((n) => n + 1)} />
      {tabs}
      <Suspense fallback={null}>
        <Registrations notify={notify} refresh={refresh} />
      </Suspense>
    </div>
  );
}

type UserPage = { items: Row<Profile>[]; page: number; total: number };

// The server pages, searches and filters, so every user is reachable.
function UserList({
  notify,
  tabs,
}: Pick<PageProps, "notify"> & { tabs: ReactNode }) {
  // A user's operation log keeps the 日志管理 menu.
  const manage = canManageAccounts(useMe());
  const canLogs = !!useMe()?.menus.includes("logs");
  const [typed, setTyped] = useRememberedState("users.query", ""),
    [search, setSearch] = useState(typed.trim()),
    [state, setState] = useRememberedState("users.state", ""),
    [access, setAccess] = useRememberedState("users.joined", ""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState<{ kind: Dialog; row: Row<Profile> } | null>(
      null,
    ),
    show = (kind: Dialog, row: Row<Profile>) => setOpen({ kind, row }),
    close = () => setOpen(null);
  // Typing settles before it queries; any new filter starts at page 1.
  useEffect(() => {
    const next = typed.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, search]);
  const resource = useResource<UserPage>(
      "/admin/users?" +
        new URLSearchParams({ q: search, state, access, page: String(page) }),
    ),
    filtered = !!(search || state || access);
  return (
    <ResourcePage
      page="users"
      resource={resource}
      tabs={tabs}
      filters={
        <UserFilters
          search={typed}
          onSearch={setTyped}
          state={state}
          onState={(v) => {
            setState(v);
            setPage(1);
          }}
          access={access}
          onAccess={(v) => {
            setAccess(v);
            setPage(1);
          }}
        />
      }
    >
      <Table
        rows={resource.data?.items || []}
        pagination={{
          page: resource.data?.page || 1,
          total: resource.data?.total || 0,
          onChange: setPage,
        }}
        empty={filtered ? "没有匹配的用户，请调整搜索条件" : "暂无用户"}
        id={(r) => r.id}
        columns={[
          {
            title: "用户",
            render: (r) => (
              <>
                {r.data.nickname}
                <small className="cell-note mono user-id" title={r.id}>
                  {r.id}
                </small>
              </>
            ),
          },
          { title: "姓名 / 手机号", render: nameCell },
          {
            title: "注册来源",
            render: (r) => sourceLabel(initialSource(r.data)),
          },
          {
            title: "状态",
            render: (r) => (
              <Badge
                state={
                  r.data.archived
                    ? "muted"
                    : r.data.disabled
                      ? "failed"
                      : "succeeded"
                }
                label={
                  r.data.archived
                    ? "已删除"
                    : r.data.disabled
                      ? "已停用"
                      : "正常"
                }
              />
            ),
          },
          { title: "使用授权", render: accessCell },
          { title: "注册时间", render: createdCell },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <div className="business-actions">
                <button onClick={() => show("detail", r)}>详情</button>
                <button onClick={() => show("models", r)}>模型记录</button>
                {canLogs && (
                  <button onClick={() => show("activity", r)}>行为日志</button>
                )}
                {manage && !r.data.archived && (
                  <>
                    <button onClick={() => show("points", r)}>积分</button>
                    <button onClick={() => show("edit", r)}>编辑</button>
                    <button
                      className="danger-text"
                      onClick={() => show("delete", r)}
                    >
                      删除
                    </button>
                    <button
                      className={r.data.disabled ? "" : "danger-text"}
                      onClick={() => show("status", r)}
                    >
                      {r.data.disabled ? "启用" : "停用"}
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      {open?.kind === "detail" && (
        <UserDetails user={open.row} onClose={close} />
      )}
      {open?.kind === "models" && (
        <Suspense fallback={null}>
          <UserModels user={open.row} onClose={close} />
        </Suspense>
      )}
      {open?.kind === "activity" && (
        <Suspense fallback={null}>
          <UserActivity user={open.row} onClose={close} />
        </Suspense>
      )}
      {open?.kind === "points" && (
        <UserPoints user={open.row} onClose={close} notify={notify} />
      )}
      {open?.kind === "edit" && (
        <UserEdit
          user={open.row}
          onClose={close}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
      {(open?.kind === "status" || open?.kind === "delete") && (
        <UserStatus
          remove={open.kind === "delete"}
          user={open.row}
          onClose={close}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
    </ResourcePage>
  );
}
