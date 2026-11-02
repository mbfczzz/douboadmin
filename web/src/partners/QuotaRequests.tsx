import { useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import type { QuotaRequest } from "./types";
import { labels } from "./types";
import { useCommand } from "./useCommand";
export default function QuotaRequests({
  notify,
  changed,
}: {
  notify: (s: string) => void;
  changed: () => Promise<void>;
}) {
  const resource = useRecords<QuotaRequest>("/admin/quota-requests"),
    [detail, setDetail] = useState<Row<QuotaRequest> | null>(null),
    command = useCommand();
  return (
    <>
      <h3>名额申请（总账号统一审批）</h3>
      <Records
        resource={resource}
        columns={[
          { title: "服务商", render: (r) => r.data.partnerId },
          {
            title: "子账号 / 服务商名额",
            render: (r) => `${r.data.users} / ${r.data.partners}`,
          },
          { title: "原因", render: (r) => r.data.reason },
          { title: "状态", render: (r) => labels[r.data.status] },
          {
            title: "操作",
            action: true,
            render: (r) =>
              r.data.status === "pending" ? (
                <button onClick={() => setDetail(r)}>审批</button>
              ) : (
                r.data.decision || "—"
              ),
          },
        ]}
      />
      {detail && (
        <Modal
          title="名额申请审批"
          onClose={() => !command.busy && setDetail(null)}
        >
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await command.send(
                  "/admin/quota-requests/" + detail.id,
                  {
                    version: detail.version,
                    approve: f.get("decision") === "approve",
                    reason: String(f.get("reason")),
                  },
                  "PUT",
                );
                setDetail(null);
                await resource.reload();
                await changed();
                notify("审批结果已保存");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <p>
              申请 {detail.data.users} 个子账号名额、{detail.data.partners}{" "}
              个下级服务商名额。
            </p>
            <label>
              审批结果
              <select name="decision">
                <option value="approve">批准并划拨</option>
                <option value="reject">拒绝申请</option>
              </select>
            </label>
            <label>
              审批说明
              <textarea name="reason" minLength={2} maxLength={200} required />
            </label>
            <button className="primary" disabled={command.busy}>
              保存审批
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
