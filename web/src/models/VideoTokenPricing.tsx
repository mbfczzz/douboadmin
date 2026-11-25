import { Card } from "./fields";
import { effectiveModel, type SettingsProps } from "./settings";
import type { ModelSettings } from "./types";

type Prices = NonNullable<ModelSettings["videoTokenPrices"]>;

// 火山方舟 Seedance (fixed arkvideo: models): billed on the video tokens 方舟
// reports, per output resolution, lower when the task has an input video.
export default function VideoTokenPricing({
  model: m,
  onChange,
}: SettingsProps) {
  const prices: Prices = m.settings.videoTokenPrices || {};
  const resolutions = effectiveModel(m).resolutions;
  function set(res: string, field: "plain" | "withVideo", value: string) {
    const row = prices[res] ? { ...prices[res] } : { plain: 0, withVideo: 0 };
    row[field] = value === "" ? 0 : Number(value);
    onChange({ videoTokenPrices: { ...prices, [res]: row } });
  }
  return (
    <Card title="按量计费（视频 token）">
      <p className="config-hint">
        火山方舟官方直连。单价为每百万视频 token 的积分（官方「元/百万 token」×
        10），默认即官方价。提交时按 token 估算（输入视频秒数 + 输出秒数）× 宽 ×
        高 × 24 帧 ÷ 1024 再加 15% 预留积分，生成成功后按方舟返回的实际 token
        扣除，多余退回；失败全部退回。
      </p>
      <div
        className="config-matrix"
        role="region"
        aria-label="视频 token 单价"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>输出清晰度</th>
              <th>不含视频输入</th>
              <th>含视频输入</th>
            </tr>
          </thead>
          <tbody>
            {resolutions.map((r) => (
              <tr key={r}>
                <td>{r.toUpperCase()}</td>
                {(["plain", "withVideo"] as const).map((field) => (
                  <td key={field}>
                    <input
                      aria-label={`${r.toUpperCase()} ${field === "plain" ? "不含视频输入" : "含视频输入"}单价`}
                      type="number"
                      min={0}
                      max={100000}
                      step="any"
                      value={prices[r]?.[field] ?? ""}
                      onChange={(e) => set(r, field, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="config-hint">
        单位：积分 / 百万 token。参考视频按实际时长计入
        token，无需开启参考视频计费。
      </p>
    </Card>
  );
}
