import { useState } from "react";
import { api, date, type Row } from "../api";
import type { Notify } from "../navigation";
import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import Modal from "../components/Modal";
import Table from "./Table";
import { money } from "./types";

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
  const [detail, setDetail] = useState<Row<PaymentEvent> | null>(null);
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  async function act(action: "retry" | "review") {
    if (!detail || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/admin/virtual-payments/events/${detail.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ version: detail.version, note: note.trim() }),
      });
      setDetail(null);
      notify(
        action === "retry"
          ? "已重新处理，请查看最新订单和退款状态"
          : "核对说明已保存，资金状态未改变",
      );
    } catch (e) {
      notify((e as Error).message, "error");
      setActionError((e as Error).message);
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
              render: (r) => states[r.data.status] || r.data.status,
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
                <button
                  onClick={() => {
                    setDetail(r);
                    setNote("");
                    setActionError("");
                  }}
                >
                  查看处理
                </button>
              ),
            },
          ]}
        />
      )}
      {detail && (
        <Modal
          title="虚拟支付异常处理"
          onClose={() => !busy && setDetail(null)}
        >
          <div className="edit-form">
            {actionError && (
              <p className="error" role="alert">
                {actionError}
              </p>
            )}
            <dl>
              <dt>事件</dt>
              <dd>{events[detail.data.event] || detail.data.event}</dd>
              <dt>订单号</dt>
              <dd className="mono">{detail.data.orderId || "未关联"}</dd>
              <dt>退款单号</dt>
              <dd className="mono">{detail.data.refundId || "—"}</dd>
              <dt>通知退款金额</dt>
              <dd>
                {detail.data.amountFen
                  ? money(detail.data.amountFen)
                  : "未提供"}
              </dd>
              <dt>状态</dt>
              <dd>{states[detail.data.status]}</dd>
              <dt>最近原因</dt>
              <dd>{detail.data.lastError || "—"}</dd>
              {detail.data.note && (
                <>
                  <dt>核对说明</dt>
                  <dd>{detail.data.note}</dd>
                </>
              )}
              {detail.data.actor && (
                <>
                  <dt>处理人 / 时间</dt>
                  <dd>
                    {detail.data.actor} / {date(detail.data.handledAt || "")}
                  </dd>
                </>
              )}
            </dl>
            {!["done", "reviewed"].includes(detail.data.status) && (
              <>
                <label>
                  人工核对说明
                  <textarea
                    value={note}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="填写微信交易核对结果及后续处理记录"
                  />
                </label>
                <p className="quiet">
                  重试沿用原订单。保存核对说明后停止自动重试，不会执行退款或增减积分。
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    disabled={busy || !note.trim()}
                    onClick={() => void act("review")}
                  >
                    保存核对说明
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void act("retry")}
                  >
                    {busy ? "处理中…" : "重试处理"}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
