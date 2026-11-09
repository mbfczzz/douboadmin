import { useState } from "react";
import { isProviderAccount, useMe } from "../session";
import { date, type Row } from "../api";
import { money } from "../business/types";
import Modal from "../components/Modal";
import { ask } from "../confirm/ask";
import Records, { useRecords } from "./Records";
import { useCommand } from "./useCommand";
import type { Payout, Scope } from "./types";
import { hundredths } from "./types";
import { PartnerStatus } from "./PartnerIdentity";
import "../components/detail.css";
export default function Payouts({ id, view, changed, notify }: Scope) {
  const resource = useRecords<Payout>("/admin/commission-payouts?owner=" + id),
    [create, setCreate] = useState(false),
    command = useCommand(),
    // Confirming offline payouts is a platform task.
    provider = isProviderAccount(useMe());
  // 确认打款 and 取消提现 are separate buttons, each asking for its own record.
  async function settle(row: Row<Payout>, status: "paid" | "cancelled") {
    const paid = status === "paid",
      amount = money(row.data.amountFen);
    const reference = await ask({
      title: paid ? "确认已线下打款" : "取消提现",
      message: paid
        ? `确认已向服务商线下打款 ${amount}。本操作仅登记打款结果，不会自动转账。`
        : `取消后 ${amount} 佣金解冻，回到服务商可提现余额。`,
      confirmText: paid ? "登记打款" : "取消提现",
      danger: !paid,
      reason: {
        label: paid ? "打款流水号" : "取消原因",
        placeholder: paid ? "银行或支付平台的转账流水号" : undefined,
        minLength: 4,
      },
      run: (reference) =>
        command.send(
          "/admin/commission-payouts/" + row.id,
          { version: row.version, status, reference },
          "PUT",
          { before: row.data },
        ),
    });
    if (reference === false) return;
    notify(paid ? "打款结果已登记" : "提现已取消，佣金已解冻");
    await resource.reload();
    await changed();
  }
  return (
    <>
      <Records
        title="提现与线下打款登记"
        description="仅登记提现和打款凭据，不会自动从微信商户转账。"
        footnote="已提现佣金遇到退款会形成负余额，后续佣金优先抵扣。"
        resource={resource}
        actions={
          <button
            type="button"
            className="primary"
            disabled={view.commission.balanceFen <= 0}
            onClick={() => setCreate(true)}
          >
            申请提现
          </button>
        }
        columns={[
          {
            title: "金额",
            render: (r) => (
              <span className="amount">{money(r.data.amountFen)}</span>
            ),
          },
          {
            title: "状态",
            render: (r) => <PartnerStatus state={r.data.status} />,
          },
          {
            title: "说明 / 凭据",
            render: (r) => (
              <>
                {r.data.note}
                <small className="cell-note">{r.data.reference}</small>
              </>
            ),
          },
          { title: "申请时间", render: (r) => date(r.createdAt) },
          {
            title: "操作",
            action: true,
            render: (r) =>
              r.data.status === "pending" && !provider ? (
                <div className="business-actions">
                  <button
                    className="text-button"
                    disabled={command.busy}
                    onClick={() => void settle(r, "paid")}
                  >
                    确认打款
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={command.busy}
                    onClick={() => void settle(r, "cancelled")}
                  >
                    取消提现
                  </button>
                </div>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {create && (
        <Modal
          className="form-modal"
          title="申请提现"
          onClose={() => !command.busy && setCreate(false)}
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
                  "/admin/commission-payouts",
                  {
                    partnerId: id,
                    amountFen: hundredths(f.get("amount")),
                    note: String(f.get("note")),
                  },
                  "POST",
                  {
                    title: "确认申请提现",
                    format: { partnerId: () => view.record.data.name },
                  },
                );
                notify("提现申请已提交，佣金已预留");
                setCreate(false);
                await resource.reload();
                await changed();
              } catch (e) {
                notify((e as Error).message, "error");
              }
            }}
          >
            <div className="form-body">
              <fieldset disabled={command.busy}>
                <label>
                  提现金额（元）
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  说明
                  <textarea
                    name="note"
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
                onClick={() => !command.busy && setCreate(false)}
              >
                取消
              </button>
              <button className="primary" disabled={command.busy}>
                预留提现佣金
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
