import { useState } from "react";
import { date } from "../api";
import Records, { useRecords } from "./Records";
import QuotaForm from "./QuotaForm";
import QuotaRequests from "./QuotaRequests";
import type { Move, Scope } from "./types";
import { labels } from "./types";
import { PartnerIdentity } from "./PartnerIdentity";
export default function Quotas({ id, view, changed, notify }: Scope) {
  const resource = useRecords<Move>("/admin/quota-moves"),
    [form, setForm] = useState<"move" | "request" | null>(null),
    [revision, setRevision] = useState(0);
  return (
    <>
      <Records
        title="名额划拨记录"
        resource={resource}
        actions={
          <>
            <button
              type="button"
              className="primary"
              onClick={() => setForm("move")}
            >
              划拨 / 收回名额
            </button>
            <button
              type="button"
              className="secondary"
              disabled={id === "root"}
              onClick={() => setForm("request")}
            >
              向上级申请
            </button>
          </>
        }
        columns={[
          {
            title: "上级服务商",
            render: (r) => <PartnerIdentity id={r.data.parentId} />,
          },
          {
            title: "下级服务商",
            render: (r) => <PartnerIdentity id={r.data.childId} />,
          },
          { title: "类型", render: (r) => labels[r.data.kind] },
          {
            title: "用户额度",
            render: (r) => r.data.users,
          },
          { title: "说明", render: (r) => r.data.reason },
          { title: "时间", render: (r) => date(r.createdAt) },
        ]}
      />
      <QuotaRequests
        key={revision}
        notify={notify}
        changed={async () => {
          await resource.reload();
          await changed();
        }}
      />
      {form && (
        <QuotaForm
          view={view}
          request={form === "request"}
          notify={notify}
          onClose={() => setForm(null)}
          onSaved={async () => {
            await resource.reload();
            await changed();
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
