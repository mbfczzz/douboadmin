import Badge from "../components/Badge";
import { useState } from "react";
import type { Row } from "../api";
import { useMe } from "../session";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import UserDetails from "../business/UserDetails";
import UserPoints from "../business/UserPoints";
import UserEdit from "../business/UserEdit";
import UserStatus from "../business/UserStatus";
import SignupSwitch from "../users/SignupSwitch";
import "../users/users.css";
import UserModels from "../users/UserModels";
import UserActivity from "../users/UserActivity";
import { accessCell, createdCell, nameCell } from "../users/cells";

type Dialog = "detail" | "models" | "activity" | "points" | "edit" | "status";
import type { Profile } from "../business/types";

export default function Users({ notify }: PageProps) {
  // A user's operation log keeps the 日志管理 menu.
  const canLogs = !!useMe()?.menus.includes("logs");
  const resource = useResource<Row<Profile>[]>("/admin/users"),
    [query, setQuery] = useRememberedState("users.query", ""),
    [state, setState] = useRememberedState("users.state", ""),
    [access, setAccess] = useRememberedState("users.access", ""),
    [open, setOpen] = useState<{ kind: Dialog; row: Row<Profile> } | null>(
      null,
    ),
    show = (kind: Dialog, row: Row<Profile>) => setOpen({ kind, row }),
    close = () => setOpen(null);
  const userState = (p: Profile) =>
      p.archived ? "archived" : p.disabled ? "disabled" : "active",
    userAccess = (p: Profile) =>
      !p.access?.active
        ? "none"
        : p.access.status === "direct"
          ? "direct"
          : "provider";
  const rows = (resource.data || []).filter(
    (r) =>
      [r.id, r.data.nickname, r.data.name, r.data.phone].some((v) =>
        v?.includes(query),
      ) &&
      (!state || userState(r.data) === state) &&
      (!access || userAccess(r.data) === access),
  );
  return (
    <ResourcePage page="users" resource={resource}>
      <div className="business-filters">
        <input
          type="search"
          aria-label="搜索用户"
          placeholder="搜索昵称、姓名、手机号或编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="账号状态"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="disabled">已停用</option>
          <option value="archived">已归档</option>
        </select>
        <select
          aria-label="开通方式"
          value={access}
          onChange={(e) => setAccess(e.target.value)}
        >
          <option value="">全部开通方式</option>
          <option value="provider">服务商激活</option>
          <option value="direct">直接开通</option>
          <option value="none">未开通</option>
        </select>
        <SignupSwitch notify={notify} />
      </div>
      <Table
        key={query + state + access}
        rows={rows}
        empty={
          query || state || access
            ? "没有匹配的用户，请调整搜索条件"
            : "暂无用户"
        }
        id={(r) => r.id}
        columns={[
          {
            title: "小程序用户",
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
                    ? "已归档"
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
                {!r.data.archived && (
                  <>
                    <button onClick={() => show("points", r)}>积分</button>
                    <button onClick={() => show("edit", r)}>编辑</button>
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
        <UserModels user={open.row} onClose={close} />
      )}
      {open?.kind === "activity" && (
        <UserActivity user={open.row} onClose={close} />
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
      {open?.kind === "status" && (
        <UserStatus
          user={open.row}
          onClose={close}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
    </ResourcePage>
  );
}
