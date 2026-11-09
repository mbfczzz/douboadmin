import { useState } from "react";
import type { PaymentPage } from "./types";
import { useResource } from "../hooks/useResource";
import Table from "./Table";
import RequestState from "../components/RequestState";
import { channels, money, points, statuses } from "./types";
import Tag, { IdChip } from "../components/Tag";
import StatusBadge from "../components/StatusBadge";
import DateField from "../components/DateField";
import { date } from "../api";

const time = (value: string) => date(value, true);
export default function PaymentRecords() {
  const [filters, setFilters] = useState(""),
    [page, setPage] = useState(1);
  const resource = useResource<PaymentPage>(
    `/admin/payments?page=${page}&${filters}`,
  );
  return (
    <>
      <form
        className="business-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          new FormData(e.currentTarget).forEach((value, key) =>
            params.set(key, String(value)),
          );
          const next = params.toString();
          if (page === 1 && filters === next) void resource.reload();
          else {
            setPage(1);
            setFilters(next);
          }
        }}
      >
        <label>
          关键词
          <input
            type="search"
            name="q"
            aria-label="搜索支付记录"
            placeholder="订单号 / 微信交易号 / 用户编号"
            maxLength={100}
            size={30}
          />
        </label>
        <label>
          订单状态
          <select name="status" aria-label="支付记录状态">
            <option value="">全部已支付订单</option>
            {["paid", "refunding", "refunded"].map((v) => (
              <option key={v} value={v}>
                {statuses[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          到账开始（北京时间）
          <DateField name="from" label="到账开始日期" />
        </label>
        <label>
          到账结束（北京时间）
          <DateField name="to" label="到账结束日期" />
        </label>
        <button className="primary" type="submit">
          查询
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void resource.reload()}
        >
          刷新
        </button>
      </form>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          rows={resource.data.items}
          id={(r) => r.transactionId}
          empty="暂无支付记录"
          pagination={{
            page: resource.data.page,
            total: resource.data.total,
            onChange: setPage,
          }}
          columns={[
            {
              title: "微信交易号 / 订单",
              render: (r) => (
                <>
                  <span className="mono">{r.transactionId}</span>
                  <small className="cell-note">{r.orderId}</small>
                </>
              ),
            },
            { title: "用户", render: (r) => <IdChip>{r.userId}</IdChip> },
            {
              title: "实付 / 到账积分",
              render: (r) => (
                <>
                  <span className="amount">{money(r.amountFen)}</span>
                  <span className="cell-tags">
                    <Tag tone="accent">+{points(r.pointsUnits)} 积分</Tag>
                  </span>
                </>
              ),
            },
            {
              title: "订单状态",
              render: (r) => (
                <>
                  <StatusBadge status={r.status} />
                  {r.refundId && (
                    <small className="cell-note">退款单：{r.refundId}</small>
                  )}
                </>
              ),
            },
            {
              title: "支付 / 到账时间",
              render: (r) => (
                <>
                  {time(r.paidAt)}
                  <small className="cell-note">{time(r.confirmedAt)}</small>
                </>
              ),
            },
            {
              title: "渠道",
              render: (r) => {
                const [label, tone] = channels[r.channel] || [
                  r.channel,
                  "muted",
                ];
                return <Tag tone={tone}>{label}</Tag>;
              },
            },
          ]}
        />
      )}
    </>
  );
}
