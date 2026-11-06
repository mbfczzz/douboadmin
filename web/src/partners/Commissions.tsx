import { useState } from "react";
import { date } from "../api";
import { money } from "../business/types";
import Records, { useRecords } from "./Records";
import PolicyForm from "./PolicyForm";
import Payouts from "./Payouts";
import type { Scope, CommissionEntry } from "./types";
import { labels } from "./types";
import OrderDistribution from "./OrderDistribution";
export default function Commissions(scope: Scope) {
  const [order, setOrder] = useState("");
  const { id, view, notify, changed } = scope,
    resource = useRecords<CommissionEntry>(
      "/admin/commission-ledger?owner=" + id,
    );
  return (
    <>
      <div className="business-metrics">
        {[
          ["可提现 / 待抵扣", view.commission.balanceFen],
          ["预留佣金", view.commission.heldFen],
          ["已线下打款", view.commission.paidOutFen],
        ].map(([label, value]) => (
          <div className="panel" key={String(label)}>
            <span>{label}</span>
            <strong>{money(Number(value))}</strong>
          </div>
        ))}
      </div>
      {id === "root" && <PolicyForm notify={notify} changed={changed} />}
      <Records
        title="佣金流水"
        resource={resource}
        columns={[
          { title: "类型", render: (r) => labels[r.data.kind] || r.data.kind },
          {
            title: "可用变动 / 预留变动",
            render: (r) => (
              <>
                {money(r.data.amountFen)}
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
