import type { Breakdown } from "../business/types";
import HBars from "./HBars";
import { pct } from "./format";
import "./panels.css";

const parts = [
  ["provider", "服务商激活", "var(--accent-hover)"],
  ["direct", "直接开通", "var(--info)"],
] as const;

// New users by how they got access, code redemption and top providers.
export default function Activations({ b }: { b: Breakdown }) {
  const n = { provider: b.providerActivations, direct: b.directActivations },
    total = n.provider + n.direct,
    providers = b.providers || [];
  return (
    <section className="panel stat-panel">
      <div className="section-head">
        <h2>开通情况</h2>
        <span className="quiet">服务商与直接开通</span>
      </div>
      <div className="stat-hero">
        <b>{total}</b>
        <span className="quiet">新开通用户（人）</span>
      </div>
      <div
        className={"mix-bar" + (total ? "" : " no-data")}
        role="img"
        aria-label="开通方式占比"
      >
        {!!total &&
          parts.map(([k, , color]) => (
            <i key={k} style={{ flex: n[k], background: color }} />
          ))}
      </div>
      <ul className="mix-legend">
        {parts.map(([k, label, color]) => (
          <li key={k} className={n[k] ? undefined : "zero"}>
            <i style={{ background: color }} />
            {label}
            <b>{n[k]} 人</b>
            <span className="quiet">{pct(n[k], total)}</span>
          </li>
        ))}
      </ul>
      <dl className="stat-facts">
        <div>
          <dt>授权码核销率</dt>
          <dd>
            {pct(b.codesRedeemed, b.codesIssued)}
            <small>
              核销 {b.codesRedeemed} / 发放 {b.codesIssued} 张
            </small>
          </dd>
        </div>
      </dl>
      {providers.length > 0 && (
        <>
          <h3 className="stat-sub">服务商排行</h3>
          <HBars
            label="服务商激活排行"
            rows={providers.map((p) => ({
              key: p.id,
              label: p.name,
              value: p.activations,
              display: `${p.activations} 人`,
            }))}
          />
        </>
      )}
    </section>
  );
}
