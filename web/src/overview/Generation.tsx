import { points, type Breakdown } from "../business/types";
import HBars, { Columns } from "./HBars";
import { kindNames, pct, seconds } from "./format";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

// What users generate and when they do it.
export default function Generation({ b }: { b: Breakdown }) {
  const kinds = Object.entries(b.kinds || {}).sort(
    (x, y) => y[1].jobs - x[1].jobs,
  );
  return (
    <div className="overview-grid">
      <section className="panel">
        <div className="section-head">
          <h2>生成类型分布</h2>
          <span className="quiet">次数 · 成功率</span>
        </div>
        <HBars
          label="生成类型分布"
          rows={kinds.map(([kind, k]) => ({
            key: kind,
            label: kindNames[kind] || kind,
            value: k.jobs,
            display: `${k.jobs} · ${pct(k.succeeded, k.jobs)}`,
            tip: `${kindNames[kind] || kind}：${k.jobs} 次，成功 ${k.succeeded}，失败 ${k.failed}，平均 ${seconds(k.durationMs, k.timed)}，消耗 ${points(k.spentUnits)} 积分`,
          }))}
        />
        {!!kinds.length && (
          <div
            className="kind-table"
            role="table"
            aria-label="各类型耗时与积分"
          >
            <span role="columnheader">类型</span>
            <span role="columnheader">失败</span>
            <span role="columnheader">平均耗时</span>
            <span role="columnheader">积分消耗</span>
            {kinds.map(([kind, k]) => (
              <div key={kind} role="row" style={{ display: "contents" }}>
                <span role="cell">{kindNames[kind] || kind}</span>
                <b role="cell">{k.failed}</b>
                <b role="cell">{seconds(k.durationMs, k.timed)}</b>
                <b role="cell">{points(k.spentUnits)}</b>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>生成时段</h2>
          <span className="quiet">北京时间 · 按小时</span>
        </div>
        <Columns
          label="按小时的生成分布"
          values={b.hours || []}
          labels={(b.hours || []).map((_, h) => (h % 6 === 0 ? `${h}时` : ""))}
          tip={(h) => `${h}:00–${h}:59：${b.hours[h]} 次`}
        />
        <div className="section-head sub">
          <h3>星期分布</h3>
        </div>
        <Columns
          label="按星期的生成分布"
          values={b.weekdays || []}
          labels={weekdays.map((d) => "周" + d)}
          tip={(i) => `周${weekdays[i]}：${b.weekdays[i]} 次`}
        />
      </section>
    </div>
  );
}
