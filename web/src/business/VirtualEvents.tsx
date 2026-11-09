import { useState } from "react";
import { api, date, type Row } from "../api";
import type { Notify } from "../navigation";
import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import Modal from "../components/Modal";
import Table from "./Table";
import { money } from "./types";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import DetailCard, { Field } from "../components/DetailCard";
import { ask } from "../confirm/ask";

type PaymentEvent = {
  event: string;
  orderId: string;
  refundId: string;
  status: string;
  lastError?: string;
  note?: string;
  actor?: string;
  handledAt?: string;
  amountFen: number;
};
const states: Record<string, string> = {
  pending: "待重试",
  needs_review: "待人工核对",
  failed: "平台退款失败",
  done: "已处理",
  reviewed: "已人工核对",
};
const stateTones: Record<string, string> = {
  pending: "queued",
  needs_review: "queued",
  failed: "failed",
  done: "succeeded",
  reviewed: "succeeded",
};
const events: Record<string, string> = {
  refund_submission: "退款提交未确认",
  refund_abnormal: "平台退款异常",
  xpay_refund_notify: "退款通知",
  xpay_goods_deliver_notify: "支付发货通知",
  xpay_complaint_notify: "支付投诉",
  xpay_wxpay_callback_notify: "微信支付通知",
};
export default function VirtualEvents({ notify }: { notify: Notify }) {
  const [status, setStatus] = useState("pending"),
    [page, setPage] = useState(1);
  const resource = useResource<{
    items: Row<PaymentEvent>[];
    total: number;
    page: number;
  }>(`/admin/virtual-payments/events?status=${status}&page=${page}`);
  const [detail, setDetail] = useState<Row<PaymentEvent> | null>(null),
    [busy, setBusy] = useState(false);
  // 重试处理 and 人工核对 are separate row actions with their own dialogs.
  const send = (
    row: Row<PaymentEvent>,
    action: "retry" | "review",
    note = "",
  ) =>
    api(`/admin/virtual-payments/events/${row.id}/${action}`, {
      method: "POST",
      confirmation: {
        before: row.data,
        title: action === "retry" ? "重试处理通知" : "确认保存核对说明",
      },
      body: JSON.stringify(
        action === "retry"
          ? { version: row.version }
          : { version: row.version, note },
      ),
    });
  // 重试处理 and 人工核对 are separate row actions with their own dialogs.
  async function act(row: Row<PaymentEvent>, action: "retry" | "review") {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "retry") {
        await send(row, "retry");
        notify("已重新处理，请查看最新订单和退款状态");
      } else {
        const note = await ask({
          title: "人工核对",
          message: "保存核对说明后停止自动重试，不会执行退款或增减积分。",
          confirmText: "保存核对说明",
          reason: {
            label: "核对说明",
            placeholder: "填写微信交易核对结果及后续处理记录",
            maxLength: 500,
          },
          run: (note) => send(row, "review", note),
        });
        if (note !== false) notify("核对说明已保存，资金状态未改变");
      }
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
      void resource.reload();
    }
  }
  return (
    <>
      <div className="business-filters">
        <select
          aria-label="异常处理状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          {Object.entries(states).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => void resource.reload()}>
          刷新
        </button>
      </div>
      <p className="quiet">
        待重试通知会自动重试。金额不符、积分不足等异常请先核对订单和微信记录；人工核对不会修改积分或退款结果。
      </p>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          rows={resource.data.items}
          id={(r) => r.id}
          empty="暂无此状态的支付异常"
          pagination={{
            page: resource.data.page,
            total: resource.data.total,
            onChange: setPage,
          }}
          columns={[
            {
              title: "事件 / 订单",
              render: (r) => (
                <>
                  {events[r.data.event] || r.data.event}
                  <small className="cell-note mono">
                    {r.data.orderId || "未关联订单"}
                  </small>
                </>
              ),
            },
            {
              title: "处理状态",
              render: (r) => (
                <Badge
                  state={stateTones[r.data.status] || "muted"}
                  label={states[r.data.status] || r.data.status}
                />
              ),
            },
            {
              title: "最近原因",
              render: (r) =>
                r.data.lastError || r.data.note || "待核对通知详情",
            },
            { title: "接收时间", render: (r) => date(r.createdAt) },
            {
              title: "操作",
              action: true,
              render: (r) => (
                <div className="business-actions">
                  <button onClick={() => setDetail(r)}>详情</button>
                  {!["done", "reviewed"].includes(r.data.status) && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => void act(r, "retry")}
                      >
                        重试处理
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void act(r, "review")}
                      >
                        人工核对
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
      {detail && (
        <Modal title="虚拟支付异常详情" onClose={() => setDetail(null)}>
          <div className="edit-form">
            <DetailCard title="通知信息">
              <Field label="事件">
                <Tag tone="info">
                  {events[detail.data.event] || detail.data.event}
                </Tag>
              </Field>
              <Field label="状态">
                <Badge
                  state={stateTones[detail.data.status] || "muted"}
                  label={states[detail.data.status] || detail.data.status}
                />
              </Field>
              <Field label="订单号">
                {detail.data.orderId ? (
                  <IdChip>{detail.data.orderId}</IdChip>
                ) : (
                  <Tag>未关联</Tag>
                )}
              </Field>
              <Field label="退款单号">
                {detail.data.refundId ? (
                  <IdChip>{detail.data.refundId}</IdChip>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="通知退款金额">
                {detail.data.amountFen ? (
                  <span className="amount">{money(detail.data.amountFen)}</span>
                ) : (
                  "未提供"
                )}
              </Field>
              <Field label="最近原因">
                {detail.data.lastError ? (
                  <span className="danger-text">{detail.data.lastError}</span>
                ) : (
                  "—"
                )}
              </Field>
              {detail.data.note && (
                <Field label="核对说明">{detail.data.note}</Field>
              )}
              {detail.data.actor && (
                <Field label="处理人 / 时间">
                  {detail.data.actor} · {date(detail.data.handledAt || "")}
                </Field>
              )}
            </DetailCard>
          </div>
        </Modal>
      )}
    </>
  );
}
