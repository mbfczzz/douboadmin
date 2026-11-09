import { isProviderAccount, useMe } from "../session";
import type { Row } from "../api";
import { ask } from "../confirm/ask";
import Records, { useRecords } from "./Records";
import type { QuotaRequest } from "./types";
import { PartnerIdentity, PartnerStatus } from "./PartnerIdentity";
import { useCommand } from "./useCommand";
import type { Notify } from "../navigation";
export default function QuotaRequests({
  id,
  notify,
  changed,
}: {
  id: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  // The platform view is the approval inbox; a provider sees its own requests
  // and those of its direct children.
  const resource = useRecords<QuotaRequest>(
      "/admin/quota-requests" + (id === "root" ? "" : "?around=" + id),
    ),
    command = useCommand(),
    // Approval stays with the platform; provider logins only see the history.
    provider = isProviderAccount(useMe());
  // 批准 and 拒绝 are separate buttons; each asks for its own explanation.
  async function decide(row: Row<QuotaRequest>, approve: boolean) {
    const reason = await ask({
      title: approve ? "批准名额申请" : "拒绝名额申请",
      message: approve
        ? `批准后向该服务商划拨 ${row.data.users} 个用户名额。`
        : `拒绝后不划拨名额，服务商可重新申请。`,
      confirmText: approve ? "批准并划拨" : "拒绝申请",
      danger: !approve,
      reason: { label: "审批说明", minLength: 2 },
      run: (reason) =>
        command.send(
          "/admin/quota-requests/" + row.id,
          { version: row.version, approve, reason },
          "PUT",
        ),
    });
    if (reason === false) return;
    notify(approve ? "已批准并划拨名额" : "已拒绝名额申请");
    await resource.reload();
    await changed();
  }
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
            render: (r) => <span className="amount">{r.data.users}</span>,
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
                <div className="business-actions">
                  <button
                    className="text-button"
                    disabled={command.busy}
                    onClick={() => void decide(r, true)}
                  >
                    批准
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={command.busy}
                    onClick={() => void decide(r, false)}
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </>
  );
}
