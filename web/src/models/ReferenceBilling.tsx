import type { SettingsProps } from "./settings";

// 参考视频计费 (FlowLight): each 全能参考 video costs the 时长 × 清晰度 price
// of the shortest duration that covers it, added to the generation.
// It needs the 时长 × 清晰度 table; without one (no durations, hidden
// resolution) the switch is only shown so it can be turned off.
export default function ReferenceBilling({
  model: m,
  onChange,
  priced = true,
}: SettingsProps & { priced?: boolean }) {
  const s = m.settings || {};
  const on = !!s.referenceVideoBillingEnabled;
  if (m.kind !== "video" || !(m.referenceTypes || []).includes("video"))
    return null;
  if (!priced && !on) return null;
  return (
    <div className="config-reference-billing">
      <label className="config-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange({ referenceVideoBillingEnabled: e.target.checked })
          }
        />
        <span>参考视频计费</span>
        <small>{on ? "开启" : "关闭"}</small>
      </label>
      <p className="config-hint">
        开启后，每段参考视频按实际秒数向上取到最近的支持时长，按下表「时长 ×
        清晰度」的积分乘以价格比例后另行收取，与生成费用相加。例如参考视频 7
        秒、支持 5 / 10 秒时，按 10 秒档收费；超过最长时长的参考视频无法提交。
        {on && " 下表每个格子都必须填写大于 0 的积分。"}
      </p>
      {on && (
        <div className="config-field config-reference-rate">
          <span>参考视频价格比例</span>
          <div className="config-inline">
            <input
              aria-label="参考视频价格比例"
              type="number"
              min={1}
              max={100}
              step="any"
              value={s.referenceVideoPricePercent || 100}
              onChange={(e) =>
                onChange({ referenceVideoPricePercent: Number(e.target.value) })
              }
            />
            <strong>%</strong>
          </div>
          <small>100% 为原价，50% 为半价；仅影响参考视频附加费用。</small>
        </div>
      )}
    </div>
  );
}
