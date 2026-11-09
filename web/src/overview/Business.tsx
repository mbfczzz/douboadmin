import { money, points, type Breakdown } from "../business/types";
import HBars from "./HBars";
import { pct } from "./format";

// Validated pair on the dark surface (lightness, chroma, CVD and contrast).
const channels: Record<string, [string, string]> = {
  wechat_virtual: ["微信虚拟支付", "#ec2b84"],
  wechat_jsapi: ["微信支付", "#1f9cc0"],
};

// Conversion, revenue mix and provider activations.
export default function Business({
  b,
  today = false,
}: {
  b: Breakdown;
  today?: boolean;
}) {
  const mix = Object.entries(b.channels || {}),
    mixTotal = mix.reduce((a, [, c]) => a + c.amountFen, 0),
    base = b.totalUsers;
  return (
    <div className="overview-grid three">
      <section className="panel">
        <div className="section-head">
          <h2>用户转化</h2>
          <span className="quiet">占累计用户</span>
        </div>
        <HBars
          label="用户转化"
          rows={[
            ["累计用户", b.totalUsers],
            [today ? "今日活跃" : "周期活跃", b.activeUsers],
            ["发起生成", b.creatorUsers],
            ["完成付费", b.payers],
          ].map(([name, n]) => ({
            key: String(name),
            label: name,
            value: Number(n),
            display: `${n} · ${pct(Number(n), base)}`,
          }))}
        />
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>收入构成</h2>
          <span className="quiet">按支付渠道</span>
        </div>
        {mixTotal ? (
          <>
            <div className="mix-bar" role="img" aria-label="支付渠道金额占比">
              {mix.map(([key, c]) => (
                <i
                  key={key}
                  className="tip"
                  data-tip={`${channels[key]?.[0] || key || "未知渠道"}：${money(c.amountFen)}，${c.orders} 笔`}
                  style={{
                    flex: c.amountFen,
                    background: channels[key]?.[1] || "var(--muted)",
                  }}
                />
              ))}
            </div>
            <ul className="mix-legend">
              {mix.map(([key, c]) => (
                <li key={key}>
                  <i
                    style={{ background: channels[key]?.[1] || "var(--muted)" }}
                  />
                  {channels[key]?.[0] || key || "未知渠道"}
                  <b>{money(c.amountFen)}</b>
                  <small>
                    {pct(c.amountFen, mixTotal)} · {c.orders} 笔
                  </small>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="chart-empty quiet">所选时段暂无支付</p>
        )}
        <dl className="fact-list">
          <dt>售出积分</dt>
          <dd>{points(b.pointsSold)}</dd>
          <dt>订单创建 → 支付</dt>
          <dd>
            {b.ordersCreated} → {b.ordersPaid}（
            {pct(b.ordersPaid, b.ordersCreated)}）
          </dd>
          <dt>成功退款</dt>
          <dd>{b.refunds} 笔</dd>
        </dl>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>服务商激活</h2>
          <span className="quiet">
            新开通 {b.directActivations + b.providerActivations} 人
          </span>
        </div>
        <dl className="fact-list">
          <dt>服务商激活 / 直接开通</dt>
          <dd>
            {b.providerActivations} / {b.directActivations}
          </dd>
          <dt>授权码发放 → 核销</dt>
          <dd>
            {b.codesIssued} → {b.codesRedeemed}（
            {pct(b.codesRedeemed, b.codesIssued)}）
          </dd>
        </dl>
        <HBars
          label="服务商激活排行"
          empty="所选时段暂无服务商激活"
          rows={(b.providers || []).map((p) => ({
            key: p.id,
            label: p.name,
            value: p.activations,
            display: `${p.activations} 人`,
          }))}
        />
      </section>
    </div>
  );
}
