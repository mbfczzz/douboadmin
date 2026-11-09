import { money, points, type Breakdown } from "../business/types";
import { pct } from "./format";
import "./panels.css";

// Validated pair on the dark surface (lightness, chroma, CVD and contrast).
const channels: Record<string, [string, string]> = {
  wechat_virtual: ["微信虚拟支付", "#ec2b84"],
  wechat_jsapi: ["微信支付", "#1f9cc0"],
};

// Money in: total, split by payment channel, order conversion and refunds.
export default function Revenue({ b }: { b: Breakdown }) {
  const paid = b.channels || {},
    keys = [...new Set([...Object.keys(channels), ...Object.keys(paid)])],
    total = keys.reduce((a, k) => a + (paid[k]?.amountFen || 0), 0);
  return (
    <section className="panel stat-panel">
      <div className="section-head">
        <h2>收入构成</h2>
        <span className="quiet">按支付渠道</span>
      </div>
      <div className="stat-hero">
        <b>{money(total)}</b>
        <span className="quiet">
          实收金额 · 售出 {points(b.pointsSold)} 积分
        </span>
      </div>
      <div
        className={"mix-bar" + (total ? "" : " no-data")}
        role="img"
        aria-label="支付渠道金额占比"
      >
        {!!total &&
          keys.map((k) => (
            <i
              key={k}
              style={{
                flex: paid[k]?.amountFen || 0,
                background: channels[k]?.[1] || "var(--muted)",
              }}
            />
          ))}
      </div>
      <ul className="mix-legend">
        {keys.map((k) => (
          <li key={k} className={paid[k]?.amountFen ? undefined : "zero"}>
            <i style={{ background: channels[k]?.[1] || "var(--muted)" }} />
            {channels[k]?.[0] || k || "未知渠道"}
            <b>{money(paid[k]?.amountFen || 0)}</b>
            <span className="quiet">{paid[k]?.orders || 0} 笔</span>
          </li>
        ))}
      </ul>
      <dl className="stat-facts">
        <div>
          <dt>订单支付率</dt>
          <dd>
            {pct(b.ordersPaid, b.ordersCreated)}
            <small>
              支付 {b.ordersPaid} / 创建 {b.ordersCreated} 笔
            </small>
          </dd>
        </div>
        <div>
          <dt>客单价</dt>
          <dd>
            {b.ordersPaid ? money(total / b.ordersPaid) : "—"}
            <small>付费用户 {b.payers} 人</small>
          </dd>
        </div>
        <div>
          <dt>成功退款</dt>
          <dd>
            {b.refunds}
            <small>笔 · 退款率 {pct(b.refunds, b.ordersPaid)}</small>
          </dd>
        </div>
      </dl>
    </section>
  );
}
