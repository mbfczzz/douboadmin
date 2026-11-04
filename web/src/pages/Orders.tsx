import { useState } from "react";
import { api, date, type Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import Modal from "../components/Modal";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import { money, points, statuses, type Order } from "../business/types";

export default function Orders({ notify }: PageProps) {
  const resource = useResource<Row<Order>[]>("/admin/orders"),
    [query, setQuery] = useRememberedState("orders.query", ""),
    [state, setState] = useRememberedState("orders.status", "");
  const [detail, setDetail] = useState<Row<Order> | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = (resource.data || []).filter(
    (r) =>
      (!state || r.data.status === state) &&
      (r.id.includes(query) || r.data.userId.includes(query)),
  );
  async function refresh(row: Row<Order>) {
    try {
      await api(`/admin/orders/${row.id}/refresh`, { method: "POST" });
      await resource.reload();
      notify("订单状态已更新");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function refund() {
    if (!detail || busy) return;
    if (!reason.trim()) {
      notify("请填写退款原因", "warning");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/orders/${detail.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setDetail(null);
      await resource.reload();
      notify("退款申请已提交，到账以微信最终结果为准");
    } catch (e) {
      notify((e as Error).message, "error");
      void resource.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourcePage page="orders" resource={resource}>
      <div className="business-filters">
        <input
          placeholder="搜索订单号或用户编号"
          aria-label="搜索订单"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="订单状态"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">全部状态</option>
          {["created", "paid", "closed", "refunding", "refunded"].map((s) => (
            <option key={s} value={s}>
              {statuses[s]}
            </option>
          ))}
        </select>
      </div>
      <Table
        key={state + query}
        rows={rows}
        empty={
          query || state ? "没有匹配的订单，请调整筛选条件" : "暂无充值订单"
        }
        id={(r) => r.id}
        columns={[
          {
            title: "订单",
            render: (r) => <span className="mono">{r.id}</span>,
          },
          {
            title: "用户",
            render: (r) => <span className="mono">{r.data.userId}</span>,
          },
          {
            title: "金额 / 积分",
            render: (r) => (
              <>
                {money(r.data.amountFen)}
                <small className="cell-note">
                  {points(r.data.pointsUnits)} 积分
                </small>
              </>
            ),
          },
          {
            title: "状态",
            render: (r) => statuses[r.data.status] || r.data.status,
          },
          { title: "创建时间", render: (r) => date(r.createdAt) },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <div className="business-actions">
                <button
                  onClick={() => {
                    setDetail(r);
                    setReason("");
                  }}
                >
                  详情
                </button>
                {r.data.status === "created" && (
                  <button onClick={() => void refresh(r)}>查单</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {detail && (
        <Modal title="充值订单详情" onClose={() => !busy && setDetail(null)}>
          <div className="edit-form">
            <dl>
              <dt>订单编号</dt>
              <dd className="mono">{detail.id}</dd>
              <dt>微信交易号</dt>
              <dd>{detail.data.transactionId || "尚未支付"}</dd>
              <dt>支付金额</dt>
              <dd>{money(detail.data.amountFen)}</dd>
              <dt>充值积分</dt>
              <dd>{points(detail.data.pointsUnits)}</dd>
              <dt>状态</dt>
              <dd>{statuses[detail.data.status]}</dd>
            </dl>
            {(detail.data.status === "paid" ||
              detail.data.status === "refunding") && (
              <>
                <p className="muted">
                  全额退款会回收该订单对应积分；可用积分不足时不能申请。重复提交使用同一退款单。
                </p>
                <label>
                  退款原因
                  <input
                    value={reason}
                    maxLength={25}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void refund()}
                >
                  {busy
                    ? "提交中…"
                    : detail.data.status === "refunding"
                      ? "重试原退款申请"
                      : "申请全额退款"}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </ResourcePage>
  );
}
