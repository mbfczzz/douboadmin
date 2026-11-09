// A tiny trend line for a headline figure; flat when there is no data.
export default function Spark({ values }: { values: number[] }) {
  const max = Math.max(0, ...values),
    w = 96,
    h = 28,
    step = values.length > 1 ? w / (values.length - 1) : w,
    y = (v: number) => (max ? h - 2 - (v / max) * (h - 4) : h - 2),
    points = values.map(
      (v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`,
    );
  if (values.length < 2 || !max) return null;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={`0,${h} ${points.join(" ")} ${w},${h}`}
        className="spark-area"
      />
      <polyline points={points.join(" ")} className="spark-line" />
    </svg>
  );
}
