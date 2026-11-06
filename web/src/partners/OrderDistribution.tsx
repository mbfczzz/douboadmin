import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import { money, points, statuses } from "../business/types";
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
            <p className="mono">{row.orderId}</p>
            <p className="mono">用户：{row.userId}</p>
            <p>
              {statuses[row.status]} · 实付 {money(row.amountFen)} · 到账{" "}
              {points(row.pointsUnits)} 积分
            </p>
            {row.distribution ? (
              <>
                <p>
                  成本 {money(row.distribution.costFen)} · 基准算力售价{" "}
                  {money(row.distribution.retailPer100Fen)}
                </p>
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
