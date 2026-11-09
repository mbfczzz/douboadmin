import {
  Film,
  Image,
  MessageSquare,
  Music,
  Scissors,
  Sparkles,
} from "lucide-react";
import { points, type Breakdown } from "../business/types";
import { Columns } from "./HBars";
import { kindNames, pct, seconds } from "./format";
import "../components/usage-bar.css";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const icons: Record<string, typeof Film> = {
  image: Image,
  video: Film,
  chat: MessageSquare,
  audio: Music,
  mix: Scissors,
};

// Per kind: volume and outcome (succeeded / failed), timing and points.
export function KindPanel({ b }: { b: Breakdown }) {
  const kinds = Object.entries(b.kinds || {}).sort(
    (x, y) => y[1].jobs - x[1].jobs,
  );
  return (
    <section className="panel">
      <div className="section-head">
        <h2>生成类型分布</h2>
        <span className="quiet">次数 · 结果</span>
      </div>
      {!kinds.length ? (
        <p className="chart-empty quiet">所选时段暂无生成任务</p>
      ) : (
        <ul className="kind-rows">
          {kinds.map(([kind, k]) => {
            const Icon = icons[kind] || Sparkles,
              part = (n: number) => `${(n / (k.jobs || 1)) * 100}%`;
            return (
              <li key={kind}>
                <span className="kind-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div>
                  <div className="kind-title">
                    <b>{kindNames[kind] || kind}</b>
                    <span>
                      <b>{k.jobs}</b> 次
                      <small>成功率 {pct(k.succeeded, k.jobs)}</small>
                    </span>
                  </div>
                  <div
                    className="usage-bar"
                    role="img"
                    aria-label={`成功 ${k.succeeded}，失败 ${k.failed}，其他 ${k.jobs - k.succeeded - k.failed}`}
                  >
                    <i className="ok" style={{ width: part(k.succeeded) }} />
                    <i className="bad" style={{ width: part(k.failed) }} />
                  </div>
                  <p className="kind-meta quiet">
                    成功 {k.succeeded} · 失败 {k.failed} · 平均耗时{" "}
                    {seconds(k.durationMs, k.timed)} · 消耗{" "}
                    {points(k.spentUnits)} 积分
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// When users generate: by hour, and by weekday for longer periods.
export function HoursPanel({
  b,
  weekdays: showWeekdays,
}: {
  b: Breakdown;
  weekdays: boolean;
}) {
  const hours = b.hours || [],
    peak = hours.indexOf(Math.max(...hours));
  return (
    <section className="panel">
      <div className="section-head">
        <h2>生成时段</h2>
        <span className="quiet">
          {hours.some(Boolean) ? `高峰 ${peak}:00–${peak + 1}:00 · ` : ""}
          北京时间
        </span>
      </div>
      {/* One empty note for both charts; weekdays mean nothing for one day. */}
      {!hours.some(Boolean) ? (
        <p className="chart-empty quiet">所选时段暂无生成任务</p>
      ) : (
        <>
          <h3 className="columns-title">按小时</h3>
          <Columns
            label="按小时的生成分布"
            values={hours}
            labels={hours.map((_, h) => (h % 3 === 0 ? String(h) : ""))}
            tip={(h) => `${h}:00–${h}:59：${hours[h]} 次`}
          />
          {showWeekdays && (
            <>
              <h3 className="columns-title">按星期</h3>
              <Columns
                label="按星期的生成分布"
                values={b.weekdays || []}
                labels={weekdays.map((d) => "周" + d)}
                tip={(i) => `周${weekdays[i]}：${b.weekdays[i]} 次`}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
