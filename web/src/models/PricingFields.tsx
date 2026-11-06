import { Card } from "./fields";
import { effectiveModel, qualityLabels, type SettingsProps } from "./settings";

export default function PricingFields({ model: m, onChange }: SettingsProps) {
  const s = m.settings,
    e = effectiveModel(m),
    video = m.kind === "video";
  if (m.kind !== "image" && !video) return null;
  const perRequest = video && s.videoBillingMode === "per_request";
  const rows = video
    ? e.durations.map((d) => [d + "s", d + "s"])
    : e.qualities.length
      ? e.qualities.map((q) => [q, qualityLabels[q] || q])
      : [["default", "默认（不分画质）"]];
  function cell(row: string, col: string, value: string) {
    const values = { ...s.priceMatrix?.[row] };
    if (value === "") delete values[col];
    else values[col] = Number(value);
    onChange({ priceMatrix: { ...s.priceMatrix, [row]: values } });
  }
  const title = perRequest
    ? "积分定价（按次 × 清晰度）"
    : video
      ? "积分定价（时长 × 清晰度）"
      : "积分定价（画质 × 清晰度）";
  return (
    <Card title={title}>
      <div
        className="config-matrix"
        role="region"
        aria-label="模型积分定价"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>
                {perRequest
                  ? "输出清晰度"
                  : video
                    ? "时长 / 清晰度"
                    : "画质 / 清晰度"}
              </th>
              {perRequest ? (
                <th>积分 / 次</th>
              ) : (
                e.resolutions.map((r) => <th key={r}>{r.toUpperCase()}</th>)
              )}
            </tr>
          </thead>
          <tbody>
            {perRequest
              ? e.resolutions.map((r) => (
                  <tr key={r}>
                    <td>{r.toUpperCase()}</td>
                    <td>
                      <input
                        aria-label={`${r.toUpperCase()} 按次积分`}
                        type="number"
                        min={0}
                        max={1e9}
                        step="any"
                        value={s.pricePerRequestByResolution?.[r] ?? ""}
                        placeholder="—"
                        onChange={(event) => {
                          const values = { ...s.pricePerRequestByResolution };
                          if (event.target.value === "") delete values[r];
                          else values[r] = Number(event.target.value);
                          onChange({ pricePerRequestByResolution: values });
                        }}
                      />
                    </td>
                  </tr>
                ))
              : rows.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {e.resolutions.map((r) => (
                      <td key={r}>
                        <input
                          aria-label={`${label} ${r.toUpperCase()} 积分`}
                          type="number"
                          min={0}
                          max={1e9}
                          step="any"
                          placeholder="—"
                          value={s.priceMatrix?.[key]?.[r] ?? ""}
                          onChange={(event) => cell(key, r, event.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className="config-hint">
        不同档位可设置不同积分；留空使用基础积分，填写 0
        表示免费。开启系统设置中的生成扣费后生效。
      </p>
    </Card>
  );
}
