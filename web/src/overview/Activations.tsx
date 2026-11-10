import type { Breakdown } from "../business/types";
import HBars from "./HBars";
import { pct } from "./format";
import "./panels.css";

const parts = [
  ["member", "会员", "var(--accent-hover)"],
  ["owner", "服务商负责人", "var(--info)"],
] as const;

// Accounts the platform (总部) opened in the period, and the providers whose
// 会员 were opened most.
export default function Activations({ b }: { b: Breakdown }) {
  const n = { member: b.memberActivations, owner: b.ownerActivations },
    total = n.member + n.owner,
    providers = b.providers || [];
  return (
    <section className="panel stat-panel">
      <div className="section-head">
        <h2>开通情况</h2>
        <span className="quiet">总部开通的账号</span>
      </div>
      <div className="stat-hero">
        <b>{total}</b>
        <span className="quiet">新开通账号（人）</span>
      </div>
      <div
        className={"mix-bar" + (total ? "" : " no-data")}
        role="img"
        aria-label="会员与服务商负责人占比"
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
      {providers.length > 0 && (
        <>
          <h3 className="stat-sub">新开通会员最多的服务商</h3>
          <HBars
            label="服务商新开通会员排行"
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
