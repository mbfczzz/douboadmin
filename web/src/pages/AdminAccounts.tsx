import Badge from "../components/Badge";
import { useState } from "react";
import { Plus } from "lucide-react";
import { date, type Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import AccountForm from "../adminAccounts/AccountForm";
import { useRoles } from "../roles/types";
import { adminRoleLabel, type AdminAccount } from "../adminAccounts/types";

export default function AdminAccounts({ notify }: PageProps) {
  const resource = useResource<{
      items: Row<AdminAccount>[];
      canManage: boolean;
    }>("/admin/accounts"),
    [editing, setEditing] = useState<Row<AdminAccount> | null | undefined>(),
    roles = useRoles(),
    roleName = (id: string) =>
      roles.rows.find((row) => row.id === id)?.data.name ||
      adminRoleLabel[id] ||
      id;
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
          { title: "角色", render: (row) => roleName(row.data.role) },
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
            render: (row) =>
              row.data.lastLoginAt ? date(row.data.lastLoginAt) : "尚未登录",
          },
          {
            title: "操作",
            action: true,
            render: (row) =>
              resource.data?.canManage ? (
                <button onClick={() => setEditing(row)}>编辑</button>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {editing !== undefined && (
        <AccountForm
          row={editing}
          notify={notify}
          onClose={() => setEditing(undefined)}
          onSaved={resource.reload}
        />
      )}
    </ResourcePage>
  );
}
