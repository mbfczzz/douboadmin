import Badge from "../components/Badge";
import Tag from "../components/Tag";
import { lazy, Suspense, useEffect, useState } from "react";
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
import { useMe, canManageAccounts } from "../session";
import { LoadingState } from "../components/RequestState";
import {
  adminRoleLabel,
  lastLogin,
  type AdminAccount,
} from "../adminAccounts/types";

const LinkUser = lazy(() => import("../adminAccounts/LinkUser"));
const ProviderAccount = lazy(() => import("../partners/ProviderAccount"));

export default function AdminAccounts({ notify }: PageProps) {
  const [page, setPage] = useState(1);
  const [linking, setLinking] = useState<Row<AdminAccount>>();
  const resource = useResource<{
      items: Row<AdminAccount>[];
      canManage: boolean;
      page: number;
      total: number;
    }>(`/admin/accounts?page=${page}`),
    [editing, setEditing] = useState<Row<AdminAccount> | null | undefined>(),
    [resetting, setResetting] = useState<Row<AdminAccount>>(),
    [provider, setProvider] = useState<Row<AdminAccount>>(),
    roles = useRoles(),
    me = useMe(),
    roleName = (id: string) =>
      roles.rows.find((row) => row.id === id)?.data.name ||
      adminRoleLabel[id] ||
      id;
  useEffect(() => {
    if (resource.data)
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(resource.data!.total / 20))),
      );
  }, [resource.data]);
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
        resource.data?.canManage && canManageAccounts(me) ? (
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
          {
            title: "手机号 / 用户关联",
            render: (row) => (
              <>
                {row.data.phone || "未填写"}
                {row.data.userId ? (
                  <small className="cell-note" title={row.data.userId}>
                    已关联用户
                  </small>
                ) : resource.data?.canManage && canManageAccounts(me) ? (
                  <div className="business-actions">
                    <button onClick={() => setLinking(row)}>关联用户</button>
                  </div>
                ) : null}
              </>
            ),
          },
          {
            title: "账号归属",
            render: (row) =>
              row.data.partnerId ? (
                <>
                  {row.data.partnerName || "服务商"}
                  <small className="cell-note mono">{row.data.partnerId}</small>
                </>
              ) : (
                "平台"
              ),
          },
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
              resource.data?.canManage && canManageAccounts(me) ? (
                row.data.partnerId ? (
                  <div className="business-actions">
                    <button onClick={() => setProvider(row)}>管理登录</button>
                    <button
                      className="danger-text"
                      onClick={() =>
                        void run(() => archive(row), "登录账号已删除")
                      }
                    >
                      删除
                    </button>
                  </div>
                ) : (
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
                            void run(() => archive(row), "管理账号已删除")
                          }
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                )
              ) : (
                "—"
              ),
          },
        ]}
      />
      {linking && (
        <Suspense fallback={<LoadingState label="正在加载关联表单" />}>
          <LinkUser
            row={
              resource.data?.items.find((r) => r.id === linking.id) || linking
            }
            onClose={() => setLinking(undefined)}
            onReload={resource.reload}
            onSaved={async () => {
              await resource.reload();
              notify("用户账号已关联");
            }}
          />
        </Suspense>
      )}
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
      {provider?.data.partnerId && (
        <Suspense fallback={<LoadingState label="正在加载登录账号" />}>
          <ProviderAccount
            accountId={provider.id}
            row={{
              id: provider.data.partnerId,
              data: {
                name: provider.data.partnerName || provider.data.name,
                role: provider.data.partnerRole || provider.data.role,
              },
            }}
            onClose={() => setProvider(undefined)}
            notify={(message, tone) => {
              notify(message, tone);
              void resource.reload();
            }}
          />
        </Suspense>
      )}
    </ResourcePage>
  );
}
