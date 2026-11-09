import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import Badge from "../components/Badge";
import Tag from "../components/Tag";
import { pageInfo, type PageId, type PageProps } from "../navigation";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import RoleForm from "../roles/RoleForm";
import { roleScopeLabel, useRoles, type RoleRow } from "../roles/types";
import { useMe } from "../session";
import "../roles/roles.css";
import { ask } from "../confirm/ask";

export default function Roles({ notify }: PageProps) {
  const roles = useRoles(),
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
      <Table
        rows={roles.rows}
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
                : names.join("、");
            },
          },
          { title: "账号数", render: (row) => row.accounts },
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
