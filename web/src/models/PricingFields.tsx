import { Card } from "./fields";
import PerSecondFill from "./PerSecondFill";
import { effectiveModel, qualityLabels, type SettingsProps } from "./settings";
import { imageResolutions, videoResolutions } from "./parameter-options";

export default function PricingFields({ model: m, onChange }: SettingsProps) {
  const s = m.settings,
    e = effectiveModel(m),
    video = m.kind === "video",
    resolutionOrder = video ? videoResolutions : imageResolutions,
    resolutions = s.hideResolution
      ? []
      : [...e.resolutions].sort(
          (a, b) =>
            resolutionOrder.indexOf(a.toLowerCase()) -
            resolutionOrder.indexOf(b.toLowerCase()),
        ),
    qualities = s.hideQuality ? [] : e.qualities;
  if (m.kind !== "image" && !video) return null;
  const perRequest = video && s.videoBillingMode === "per_request";
  if (!resolutions.length || (video && !perRequest && !e.durations.length)) {
    return (
      <Card title="基础积分计费">
        <p>当前模型没有可配置的定价档位，按「基础信息 → 消耗积分」计费。</p>
        <p>
          <strong>每次生成消耗 {m.points} 积分</strong>
        </p>
        <p className="config-hint">
          需要调整价格时，请在基础信息中修改消耗积分。
        </p>
      </Card>
    );
  }
  const rows = video
    ? e.durations.map((d) => [d + "s", d + "s"])
    : qualities.length
      ? qualities.map((q) => [q, qualityLabels[q.toLowerCase()] || q])
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
      <p className="config-hint">
        对应档位填写了价格时优先使用该价格；留空则每次生成消耗 {m.points}{" "}
        积分（基础信息中的消耗积分）。填写 0 表示免费。
      </p>
      {video && !perRequest && (
        <p className="config-hint">
          按秒填充：每项积分 = 秒数 ×
          每秒积分。填充本列会覆盖该清晰度已选时长的现有价格，之后仍可单独修改。
        </p>
      )}
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
                resolutions.map((r) => <th key={r}>{r.toUpperCase()}</th>)
              )}
            </tr>
            {video && !perRequest && (
              <tr>
                <th className="per-second-title">
                  按秒填充<small>积分 / 秒</small>
                </th>
                {resolutions.map((r) => (
                  <th key={r}>
                    <PerSecondFill
                      resolution={r}
                      durations={e.durations}
                      matrix={s.priceMatrix}
                      onChange={(priceMatrix) => onChange({ priceMatrix })}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {perRequest
              ? resolutions.map((r) => (
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
                        placeholder={`基础 ${m.points}`}
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
                    {resolutions.map((r) => (
                      <td key={r}>
                        <input
                          aria-label={`${label} ${r.toUpperCase()} 积分`}
                          type="number"
                          min={0}
                          max={1e9}
                          step="any"
                          placeholder={`基础 ${m.points}`}
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
        清空已填价格并保存后，该档位恢复使用基础信息中的消耗积分。
      </p>
    </Card>
  );
}
