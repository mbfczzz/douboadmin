import { useState } from "react";
import { date, type Row } from "../api";
import { money } from "../business/types";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import { useCommand } from "./useCommand";
import type { Payout, Scope } from "./types";
import { hundredths } from "./types";
import { PartnerStatus } from "./PartnerIdentity";
export default function Payouts({ id, view, changed, notify }: Scope) {
  const resource = useRecords<Payout>("/admin/commission-payouts?owner=" + id),
    [create, setCreate] = useState(false),
    [detail, setDetail] = useState<Row<Payout> | null>(null),
    command = useCommand();
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
          { title: "金额", render: (r) => money(r.data.amountFen) },
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
              r.data.status === "pending" ? (
                <button className="text-button" onClick={() => setDetail(r)}>
                  处理提现
                </button>
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
                await command.send("/admin/commission-payouts", {
                  partnerId: id,
                  amountFen: hundredths(f.get("amount")),
                  note: String(f.get("note")),
                });
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
      {detail && (
        <Modal
          className="form-modal"
          title="处理提现"
          onClose={() => !command.busy && setDetail(null)}
        >
          <form
            className="edit-form"
            aria-busy={command.busy}
            data-unsaved={command.busy || undefined}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                status = String(f.get("status"));
              try {
                await command.send(
                  "/admin/commission-payouts/" + detail.id,
                  {
                    version: detail.version,
                    status,
                    reference: String(f.get("reference")),
                  },
                  "PUT",
                  { before: detail.data },
                );
                setDetail(null);
                await resource.reload();
                await changed();
              } catch (e) {
                notify((e as Error).message, "error");
              }
            }}
          >
            <div className="form-body">
              <fieldset disabled={command.busy}>
                <p>{money(detail.data.amountFen)}</p>
                <label>
                  处理结果
                  <select name="status">
                    <option value="paid">确认已线下打款</option>
                    <option value="cancelled">取消提现并解冻</option>
                  </select>
                </label>
                <label>
                  打款流水号 / 取消原因
                  <textarea
                    name="reference"
                    minLength={4}
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
                保存提现结果
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
