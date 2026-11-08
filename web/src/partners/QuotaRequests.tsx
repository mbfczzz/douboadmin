import { useState } from "react";
import { isProviderAccount, useMe } from "../session";
import type { Row } from "../api";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import type { QuotaRequest } from "./types";
import { PartnerIdentity, PartnerStatus } from "./PartnerIdentity";
import { useCommand } from "./useCommand";
import type { Notify } from "../navigation";
export default function QuotaRequests({
  notify,
  changed,
}: {
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const resource = useRecords<QuotaRequest>("/admin/quota-requests"),
    [detail, setDetail] = useState<Row<QuotaRequest> | null>(null),
    command = useCommand(),
    // Approval stays with the platform; provider logins only see the history.
    provider = isProviderAccount(useMe());
  return (
    <>
      <Records
        title="名额申请"
        description="由平台管理员统一审批。"
        resource={resource}
        columns={[
          {
            title: "服务商",
            render: (r) => <PartnerIdentity id={r.data.partnerId} />,
          },
          {
            title: "用户额度",
            render: (r) => r.data.users,
          },
          { title: "原因", render: (r) => r.data.reason },
          {
            title: "状态",
            render: (r) => <PartnerStatus state={r.data.status} />,
          },
          { title: "审批说明", render: (r) => r.data.decision || "—" },
          {
            title: "操作",
            action: true,
            render: (r) =>
              r.data.status === "pending" && !provider ? (
                <button className="text-button" onClick={() => setDetail(r)}>
                  审批
                </button>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {detail && (
        <Modal
          className="form-modal"
          title="名额申请审批"
          onClose={() => !command.busy && setDetail(null)}
        >
          <form
            className="edit-form"
            aria-busy={command.busy}
            data-unsaved={command.busy || undefined}
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
                notify((e as Error).message, "error");
              }
            }}
          >
            <div className="form-body">
              <fieldset disabled={command.busy}>
                <p>申请 {detail.data.users} 个用户额度。</p>
                <label>
                  审批结果
                  <select name="decision">
                    <option value="approve">批准并划拨</option>
                    <option value="reject">拒绝申请</option>
                  </select>
                </label>
                <label>
                  审批说明
                  <textarea
                    name="reason"
                    minLength={2}
                    maxLength={200}
                    required
                  />
                </label>
              </fieldset>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={command.busy}
                onClick={() => !command.busy && setDetail(null)}
              >
                取消
              </button>
              <button className="primary" disabled={command.busy}>
                保存审批
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
