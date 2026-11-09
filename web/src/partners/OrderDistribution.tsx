import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import { money, points } from "../business/types";
import DetailCard, { Field } from "../components/DetailCard";
import StatusBadge from "../components/StatusBadge";
import { IdChip } from "../components/Tag";
export default function OrderDistribution({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const resource = useResource<{
    orderId: string;
    userId: string;
    amountFen: number;
    pointsUnits: number;
    status: string;
    distribution: null | {
      costFen: number;
      retailPer100Fen: number;
      shares: { partnerId: string; name: string; amountFen: number }[];
    };
  }>("/admin/orders/" + id + "/distribution");
  const row = resource.data;
  return (
    <Modal title="充值分佣快照" onClose={onClose}>
      <div className="edit-form">
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        />
        {row && (
          <>
            <DetailCard title="充值订单">
              <Field label="订单号">
                <IdChip>{row.orderId}</IdChip>
              </Field>
              <Field label="用户">
                <IdChip>{row.userId}</IdChip>
              </Field>
              <Field label="状态">
                <StatusBadge status={row.status} />
              </Field>
              <Field label="实付 / 到账">
                <span className="amount">{money(row.amountFen)}</span> ·{" "}
                {points(row.pointsUnits)} 积分
              </Field>
              {row.distribution && (
                <Field label="成本 / 基准售价">
                  {money(row.distribution.costFen)} /{" "}
                  {money(row.distribution.retailPer100Fen)}
                </Field>
              )}
            </DetailCard>
            {row.distribution ? (
              <>
                <div className="table-scroll">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th>分佣对象</th>
                        <th>充值时分佣</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.distribution.shares.map((v) => (
                        <tr key={v.partnerId}>
                          <td>
                            {v.name}
                            <small className="cell-note">{v.partnerId}</small>
                          </td>
                          <td>{money(v.amountFen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="quiet">
                  这是充值时的价格快照，调价后不会改写。退款冲回情况见订单状态与佣金流水。
                </p>
              </>
            ) : (
              <p>此订单未参与服务商分佣。</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
