import { useState } from "react";
import { useResource } from "../hooks/useResource";
import Table from "../business/Table";
import RequestState from "../components/RequestState";

interface FeatureRow {
  key: string;
  name: string;
  clicks: number;
  uses: number;
}
const RANGES = [
  [1, "今天"],
  [7, "近 7 天"],
  [30, "近 30 天"],
  [90, "近 90 天"],
] as const;
const count = (n: number) => n.toLocaleString("zh-CN");

// One measure as a bar scaled to the column's largest value; the number stays in ink.
function Bar({
  value,
  max,
  kind,
  label,
}: {
  value: number;
  max: number;
  kind: "clicks" | "uses";
  label: string;
}) {
  return (
    <span className="feature-bar" title={`${label} ${count(value)} 次`}>
      <span className="feature-track">
        <i
          className={kind}
          style={{ width: max ? `${(value / max) * 100}%` : 0 }}
        />
      </span>
      <b>{count(value)}</b>
    </span>
  );
}

// 功能使用: which functions users open (taps on their entries) and use
// (tasks submitted with them), most used first.
export default function FeatureStats({ revision }: { revision: number }) {
  const [days, setDays] = useState<number>(7);
  const resource = useResource<{ features: FeatureRow[] }>(
    `/admin/feature-stats?days=${days}&r=${revision}`,
  );
  const rows = resource.data?.features || [];
  const clicks = rows.reduce((n, r) => n + r.clicks, 0),
    uses = rows.reduce((n, r) => n + r.uses, 0),
    maxClicks = Math.max(0, ...rows.map((r) => r.clicks)),
    maxUses = Math.max(0, ...rows.map((r) => r.uses)),
    topBy = (max: number, pick: (r: FeatureRow) => number) =>
      (max ? rows.find((r) => pick(r) === max)?.name : "") || "—";
  return (
    <>
      <div className="feature-head">
        <div className="business-filters" role="tablist" aria-label="统计时间">
          {RANGES.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={days === value}
              onClick={() => setDays(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="feature-tiles">
          <div>
            <span>点击次数</span>
            <strong>{count(clicks)}</strong>
          </div>
          <div>
            <span>使用次数</span>
            <strong>{count(uses)}</strong>
          </div>
          <div>
            <span>点击最多</span>
            <strong>{topBy(maxClicks, (r) => r.clicks)}</strong>
          </div>
          <div>
            <span>使用最多</span>
            <strong>{topBy(maxUses, (r) => r.uses)}</strong>
          </div>
        </div>
      </div>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          rows={rows}
          id={(r) => r.key}
          empty="暂无数据"
          columns={[
            {
              title: "排名",
              render: (r) => (
                <span className="feature-rank">{rows.indexOf(r) + 1}</span>
              ),
            },
            {
              title: "功能",
              render: (r) => <span className="log-action">{r.name}</span>,
            },
            {
              title: "点击次数",
              render: (r) => (
                <Bar
                  value={r.clicks}
                  max={maxClicks}
                  kind="clicks"
                  label={r.name + " 点击"}
                />
              ),
            },
            {
              title: "使用次数",
              render: (r) => (
                <Bar
                  value={r.uses}
                  max={maxUses}
                  kind="uses"
                  label={r.name + " 使用"}
                />
              ),
            },
            {
              title: "使用 / 点击",
              align: "right",
              render: (r) =>
                r.clicks ? `${Math.round((r.uses / r.clicks) * 100)}%` : "—",
            },
          ]}
        />
      )}
      <p className="quiet feature-note">
        点击：在小程序里点开该功能入口的次数（匿名统计）。使用：用该功能提交生成任务的次数（文案提取为成功提取次数）。数字人、图文成片等仅预览的功能只有点击。
      </p>
    </>
  );
}
