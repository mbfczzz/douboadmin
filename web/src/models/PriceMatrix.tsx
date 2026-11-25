import PerSecondFill from "./PerSecondFill";
import type { ModelSettings } from "./types";

type Props = {
  label: string; // the corner cell, e.g. 时长 / 清晰度
  rows: string[][]; // [key, label]
  resolutions: string[];
  durations: number[]; // video rows get the 按秒填充 line
  points: number;
  matrix: ModelSettings["priceMatrix"];
  onChange: (priceMatrix: NonNullable<ModelSettings["priceMatrix"]>) => void;
};

// The 时长 / 画质 × 清晰度 points table.
export default function PriceMatrix(p: Props) {
  function cell(row: string, col: string, value: string) {
    const values = { ...p.matrix?.[row] };
    if (value === "") delete values[col];
    else values[col] = Number(value);
    p.onChange({ ...p.matrix, [row]: values });
  }
  return (
    <div
      className="config-matrix"
      role="region"
      aria-label="模型积分定价"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th>{p.label}</th>
            {p.resolutions.map((r) => (
              <th key={r}>{r.toUpperCase()}</th>
            ))}
          </tr>
          {p.durations.length > 0 && (
            <tr>
              <th className="per-second-title">
                按秒填充<small>积分 / 秒</small>
              </th>
              {p.resolutions.map((r) => (
                <th key={r}>
                  <PerSecondFill
                    resolution={r}
                    durations={p.durations}
                    matrix={p.matrix}
                    onChange={p.onChange}
                  />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {p.rows.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              {p.resolutions.map((r) => (
                <td key={r}>
                  <input
                    aria-label={`${label} ${r.toUpperCase()} 积分`}
                    type="number"
                    min={0}
                    max={1e9}
                    step="any"
                    placeholder={`基础 ${p.points}`}
                    value={p.matrix?.[key]?.[r] ?? ""}
                    onChange={(event) => cell(key, r, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
