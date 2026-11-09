import type { CSSProperties, ReactNode } from "react";

export type HBar = {
  key: string;
  label: ReactNode;
  value: number;
  // Text shown at the end of the bar; defaults to the value.
  display?: ReactNode;
  // Hover / screen-reader detail for the row.
  tip?: string;
};

// Horizontal magnitude bars in one hue, scaled to the largest row.
export default function HBars({
  rows,
  label,
  empty = "所选时段暂无数据",
}: {
  rows: HBar[];
  label: string;
  empty?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!max) return <p className="chart-empty quiet">{empty}</p>;
  return (
    <ul className="hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="tip" data-tip={r.tip} title={r.tip}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track" aria-hidden="true">
            {/* A zero row shows an empty track, not a sliver of bar. */}
            {r.value > 0 && (
              <i style={{ width: `${(r.value / max) * 100}%` }} />
            )}
          </span>
          <span className="hbar-value">{r.display ?? r.value}</span>
        </li>
      ))}
    </ul>
  );
}

// Vertical columns for a fixed set of buckets (hours, weekdays).
export function Columns({
  values,
  labels,
  label,
  tip,
}: {
  values: number[];
  labels: string[];
  label: string;
  tip: (i: number) => string;
}) {
  const max = Math.max(0, ...values);
  if (!max) return <p className="chart-empty quiet">所选时段暂无数据</p>;
  return (
    <div
      className="columns"
      role="img"
      aria-label={label}
      // Few buckets (weekdays) get wider bars than many (hours).
      style={
        { "--bar-max": values.length > 12 ? "14px" : "34px" } as CSSProperties
      }
    >
      {values.map((v, i) => (
        <span key={i} className="tip" data-tip={tip(i)} title={tip(i)}>
          <i style={{ height: `${Math.max(v ? 4 : 0, (v / max) * 100)}%` }} />
          <small>{labels[i]}</small>
        </span>
      ))}
    </div>
  );
}
