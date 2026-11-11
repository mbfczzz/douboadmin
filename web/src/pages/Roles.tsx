import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import Badge from "../components/Badge";
import Tag from "../components/Tag";
import { pageInfo, type PageId, type PageProps } from "../navigation";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import RoleForm from "../roles/RoleForm";
import { roleScopeLabel, type RoleRow } from "../roles/types";
import { useResource } from "../hooks/useResource";
import { useMe } from "../session";
import "../roles/roles.css";
import { ask } from "../confirm/ask";

export default function Roles({ notify }: PageProps) {
  const [page, setPage] = useState(1);
  const roles = useResource<{ items: RoleRow[]; page: number; total: number }>(
      `/admin/roles?page=${page}`,
    ),
    // Only the super administrator may change roles; others just read them.
    manage = useMe()?.role === "super_admin",
    [editing, setEditing] = useState<RoleRow | null | undefined>();
  async function remove(row: RoleRow) {
    const ok = await ask({
      title: "删除角色？",
      message: `「${row.data.name}」删除后不能再分配给账号。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok === false) return;
    try {
      await api(`/admin/roles/${row.id}`, { method: "DELETE" });
      await roles.reload();
      notify("角色已删除");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <ResourcePage
      page="roles"
      resource={roles}
      actions={
        manage && (
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={16} />
            新增角色
          </button>
        )
      }
    >
      <p className="quiet">
        角色同时用于菜单权限和用户角色展示；分公司、S1 服务商、S2
        推荐官、会员按原有归属自动对应，不改变层级或业务规则。
      </p>
      <Table
        rows={roles.data?.items || []}
        pagination={
          roles.data
            ? {
                page: roles.data.page,
                total: roles.data.total,
                onChange: setPage,
              }
            : undefined
        }
        empty="暂无角色"
        id={(row) => row.id}
        columns={[
          {
            title: "角色",
            render: (row) => (
              <>
                {row.data.name}
                {row.data.system && <small className="cell-note">内置</small>}
              </>
            ),
          },
          {
            title: "类型",
            render: (row) => (
              <Badge
                state={row.data.scope === "partner" ? "running" : "muted"}
                label={roleScopeLabel[row.data.scope]}
              />
            ),
          },
          {
            title: "可见菜单",
            render: (row) => {
              // Menus of retired pages (e.g. 内容审核) are not shown.
              const names = row.data.menus
                .filter((id) => id in pageInfo)
                .map((id) => pageInfo[id as PageId][0]);
              return names.length > 4
                ? `${names.slice(0, 3).join("、")} 等 ${names.length} 个菜单`
                : names.join("、") || "无后台菜单";
            },
          },
          { title: "后台账号数", render: (row) => row.accounts },
          {
            title: "操作",
            action: true,
            render: (row) =>
              row.id === "super_admin" || !manage ? (
                row.id === "super_admin" ? (
                  <Tag tone="accent">全部权限</Tag>
                ) : (
                  <span className="quiet">仅超级管理员可修改</span>
                )
              ) : (
                <div className="business-actions">
                  <button onClick={() => setEditing(row)}>编辑</button>
                  {!row.data.system && (
                    <button
                      className="danger-text"
                      onClick={() => void remove(row)}
                    >
                      删除
                    </button>
                  )}
                </div>
              ),
          },
        ]}
      />
      {editing !== undefined && (
        <RoleForm
          row={editing}
          notify={notify}
          onClose={() => setEditing(undefined)}
          onSaved={roles.reload}
        />
      )}
    </ResourcePage>
  );
}
