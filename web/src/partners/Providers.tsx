import { useState } from "react";
import type { Row } from "../api";
import { money } from "../business/types";
import Records, { useRecords } from "./Records";
import type { Partner, Scope } from "./types";
import { labels } from "./types";
import ProviderForm from "./ProviderForm";
export default function Providers({
  id,
  view,
  changed,
  notify,
  select,
}: { select: (id: string) => void } & Scope) {
  const resource = useRecords<Partner>("/admin/partners?owner=" + id),
    [editing, setEditing] = useState<"create" | Row<Partner> | null>(null);
  return (
    <>
      <h3>直接下级服务商</h3>
      <Records
        resource={resource}
        actions={
          <>
            <button
              type="button"
              className="primary"
              onClick={() => setEditing("create")}
            >
              新增下级服务商
            </button>
            {id !== "root" && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(view.record)}
              >
                编辑当前服务商
              </button>
            )}
          </>
        }
        columns={[
          {
            title: "名称",
            render: (r) => (
              <>
                <span className="provider-name">{r.data.name}</span>
                <small className="cell-note">{r.id}</small>
              </>
            ),
          },
          { title: "状态", render: (r) => labels[r.data.status] },
          {
            title: "子账号售价 / 基准算力",
            render: (r) => money(r.data.retailPer100Fen),
          },
          {
            title: "下级供货保留毛利",
            render: (r) => r.data.childMarginBps / 100 + "%",
          },
          {
            title: "操作",
            action: true,
            render: (r) => <button onClick={() => select(r.id)}>管理</button>,
          },
        ]}
      />
      {editing && (
        <ProviderForm
          parent={id}
          row={editing === "create" ? undefined : editing}
          onClose={() => setEditing(null)}
          notify={notify}
          onSaved={async () => {
            await resource.reload();
            await changed();
          }}
        />
      )}
    </>
  );
}
