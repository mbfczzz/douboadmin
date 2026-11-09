import { useState } from "react";
import { date } from "../api";
import { money } from "../business/types";
import Records, { useRecords } from "./Records";
import Payouts from "./Payouts";
import type { Scope, CommissionEntry } from "./types";
import { kindTones, labels } from "./types";
import Tag, { Delta } from "../components/Tag";
import OrderDistribution from "./OrderDistribution";
import TabSummary from "./TabSummary";
export default function Commissions(scope: Scope) {
  const [order, setOrder] = useState("");
  const { id, view, changed } = scope,
    resource = useRecords<CommissionEntry>(
      "/admin/commission-ledger?owner=" + id,
    );
  return (
    <>
      <TabSummary
        stats={[
          {
            label: "可提现 / 待抵扣",
            value: money(view.commission.balanceFen),
            tone: view.commission.balanceFen < 0 ? "danger" : "success",
          },
          { label: "预留佣金", value: money(view.commission.heldFen) },
          { label: "已线下打款", value: money(view.commission.paidOutFen) },
        ]}
      />
      <Records
        title="佣金流水"
        resource={resource}
        columns={[
          {
            title: "类型",
            render: (r) => (
              <Tag tone={kindTones[r.data.kind]}>
                {labels[r.data.kind] || r.data.kind}
              </Tag>
            ),
          },
          {
            title: "可用变动 / 预留变动",
            render: (r) => (
              <>
                <Delta value={r.data.amountFen}>
                  {money(r.data.amountFen)}
                </Delta>
                <small className="cell-note">{money(r.data.heldDelta)}</small>
              </>
            ),
          },
          {
            title: "订单 / 退款单",
            render: (r) => (
              <>
                {r.data.orderId ? (
                  <button
                    className="text-button"
                    onClick={() => setOrder(r.data.orderId!)}
                  >
                    {r.data.orderId}
                  </button>
                ) : (
                  "—"
                )}
                <small className="cell-note">{r.data.refundId}</small>
              </>
            ),
          },
          { title: "变动后可用", render: (r) => money(r.data.balanceAfter) },
          { title: "说明", render: (r) => r.data.note },
          { title: "时间", render: (r) => date(r.createdAt) },
        ]}
      />
      <Payouts
        {...scope}
        changed={async () => {
          await resource.reload();
          await changed();
        }}
      />
      {order && <OrderDistribution id={order} onClose={() => setOrder("")} />}
    </>
  );
}
