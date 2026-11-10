import Badge from "../components/Badge";
import Tag from "../components/Tag";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import AccountForm from "../adminAccounts/AccountForm";
import PasswordReset from "../components/PasswordReset";
import { archive, resetPassword, setDisabled } from "../adminAccounts/actions";
import { useRoles } from "../roles/types";
import { useMe } from "../session";
import {
  adminRoleLabel,
  lastLogin,
  type AdminAccount,
} from "../adminAccounts/types";

export default function AdminAccounts({ notify }: PageProps) {
  const [page, setPage] = useState(1);
  const resource = useResource<{
      items: Row<AdminAccount>[];
      canManage: boolean;
      page: number;
      total: number;
    }>(`/admin/accounts?page=${page}`),
    [editing, setEditing] = useState<Row<AdminAccount> | null | undefined>(),
    [resetting, setResetting] = useState<Row<AdminAccount>>(),
    roles = useRoles(),
    me = useMe(),
    roleName = (id: string) =>
      roles.rows.find((row) => row.id === id)?.data.name ||
      adminRoleLabel[id] ||
      id;
  // Each row action runs on its own; failures surface as a toast.
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      if ((await action()) === false) return;
      await resource.reload();
      notify(done);
    } catch (e) {
      notify((e as Error).message, "error");
      void resource.reload();
    }
  };
  return (
    <ResourcePage
      page="accounts"
      resource={resource}
      actions={
        resource.data?.canManage ? (
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={16} />
            添加管理账号
          </button>
        ) : undefined
      }
    >
      <Table
        rows={(resource.data?.items || []).filter((row) => !row.data.archived)}
        empty="暂无管理账号"
        id={(row) => row.id}
        pagination={
          resource.data
            ? {
                page: resource.data.page,
                total: resource.data.total,
                onChange: setPage,
              }
            : undefined
        }
        columns={[
          {
            title: "账号",
            render: (row) => (
              <>
                {row.data.name}
                <small className="cell-note mono">{row.data.username}</small>
              </>
            ),
          },
          {
            title: "角色",
            render: (row) => (
              <Tag
                tone={
                  row.data.role === "super_admin"
                    ? "accent"
                    : row.data.role === "operator"
                      ? "info"
                      : "muted"
                }
              >
                {roleName(row.data.role)}
              </Tag>
            ),
          },
          { title: "手机号", render: (row) => row.data.phone || "未填写" },
          {
            title: "状态",
            render: (row) => (
              <Badge
                state={row.data.disabled ? "failed" : "succeeded"}
                label={row.data.disabled ? "已停用" : "正常"}
              />
            ),
          },
          {
            title: "最后登录",
            render: (row) => lastLogin(row.data.lastLoginAt),
          },
          {
            title: "操作",
            action: true,
            render: (row) =>
              resource.data?.canManage ? (
                <div className="business-actions">
                  <button onClick={() => setEditing(row)}>编辑</button>
                  <button onClick={() => setResetting(row)}>重置密码</button>
                  {/* Your own account cannot be disabled or archived here. */}
                  {row.id !== me?.id && (
                    <>
                      <button
                        className={row.data.disabled ? "" : "danger-text"}
                        onClick={() =>
                          void run(
                            () => setDisabled(row, !row.data.disabled),
                            row.data.disabled ? "账号已启用" : "账号已停用",
                          )
                        }
                      >
                        {row.data.disabled ? "启用" : "停用"}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() =>
                          void run(() => archive(row), "管理账号已归档")
                        }
                      >
                        归档
                      </button>
                    </>
                  )}
                </div>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {editing !== undefined && (
        <AccountForm
          // Latest copy of the row, so a retry after a refresh has its version.
          row={
            editing &&
            (resource.data?.items.find((r) => r.id === editing.id) || editing)
          }
          notify={notify}
          onClose={() => setEditing(undefined)}
          onSaved={resource.reload}
        />
      )}
      {resetting && (
        <PasswordReset
          account={
            <>
              {resetting.data.name} ·{" "}
              <span className="nowrap">{resetting.data.username}</span>
            </>
          }
          onClose={() => setResetting(undefined)}
          onSubmit={async (password) => {
            // Use the latest row so a retry after a reload has its version.
            const current =
              resource.data?.items.find((r) => r.id === resetting.id) ||
              resetting;
            await resetPassword(current, password).catch((e) => {
              void resource.reload();
              throw e;
            });
            await resource.reload();
            notify("密码已重置");
          }}
        />
      )}
    </ResourcePage>
  );
}
