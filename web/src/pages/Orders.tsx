import { useState } from "react";
import { api, date, type Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import Modal from "../components/Modal";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import { money, points, statuses, type Order } from "../business/types";
import StatusBadge from "../components/StatusBadge";
import Tag, { IdChip } from "../components/Tag";
import OrderSummary from "../business/OrderSummary";
import { canRefund, refundOrder } from "../business/orderRefund";
import type { RecordPage } from "../business/recordPage";

export default function Orders({ notify }: PageProps) {
  const [query, setQuery] = useRememberedState("orders.query", ""),
    [state, setState] = useRememberedState("orders.status", "");
  const [page, setPage] = useState(1);
  const resource = useResource<RecordPage<Order>>(
    `/admin/orders?${new URLSearchParams({ page: String(page), q: query, status: state })}`,
  );
  const [detail, setDetail] = useState<Row<Order> | null>(null),
    [busy, setBusy] = useState(false);
  const rows = resource.data?.items || [];
  async function refresh(row: Row<Order>) {
    try {
      const updated = await api<Row<Order>>(`/admin/orders/${row.id}/refresh`, {
        method: "POST",
      });
      await resource.reload();
      if (
        updated.data.channel === "wechat_virtual" &&
        updated.data.status === "created" &&
        updated.data.virtual?.issued === false &&
        ["package", "custom"].includes(updated.data.virtual.purchaseMode || "")
      )
        notify("订单尚未发起微信支付，请先在小程序发起支付", "warning");
      else notify("订单状态已更新");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function refund(row: Row<Order>) {
    if (busy) return;
    setBusy(true);
    try {
      if (await refundOrder(row))
        notify("退款申请已提交，到账以微信最终结果为准");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
      void resource.reload();
    }
  }
  return (
    <ResourcePage page="orders" resource={resource}>
      <div className="business-filters">
        <input
          type="search"
          placeholder="搜索订单号或用户编号"
          aria-label="搜索订单"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="订单状态"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
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
        pagination={{
          page,
          size: resource.data?.size,
          total: resource.data?.total || 0,
          onChange: setPage,
        }}
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
            render: (r) => <IdChip>{r.data.userId}</IdChip>,
          },
          {
            title: "金额 / 积分",
            align: "right",
            render: (r) => (
              <>
                <span className="amount">{money(r.data.amountFen)}</span>
                <span className="cell-tags">
                  <Tag tone="accent">+{points(r.data.pointsUnits)} 积分</Tag>
                </span>
              </>
            ),
          },
          {
            title: "状态",
            render: (r) => <StatusBadge status={r.data.status} />,
          },
          { title: "创建时间", render: (r) => date(r.createdAt) },
          {
            title: "操作",
            action: true,
            render: (r) => (
              <div className="business-actions">
                <button onClick={() => setDetail(r)}>详情</button>
                {r.data.status === "created" && (
                  <button onClick={() => void refresh(r)}>查单</button>
                )}
                {canRefund(r) && (
                  <button
                    className="danger-text"
                    disabled={busy}
                    onClick={() => void refund(r)}
                  >
                    {r.data.status === "refunding" ? "重试退款" : "退款"}
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      {detail && (
        <Modal title="充值订单详情" onClose={() => setDetail(null)}>
          <div className="edit-form">
            <OrderSummary row={detail} />
            {detail.data.virtual?.platform === "ios" && (
              <p className="quiet">
                Apple 支付订单由用户在 App Store
                申请退款，平台通知后核对积分回收。
              </p>
            )}
          </div>
        </Modal>
      )}
    </ResourcePage>
  );
}
