import { Card, NumberField } from "./fields";
import type { SettingsProps } from "./settings";

// 按量（token）计费 for chat models. Each turn holds the most it can cost
// (longest history + the reply cap) and is settled on the tokens reported.
export default function TokenPricing({ model: m, onChange }: SettingsProps) {
  const s = m.settings;
  const priced = (s.tokenInputPrice || 0) > 0 || (s.tokenOutputPrice || 0) > 0;
  return (
    <Card title="按量计费（token）">
      <p className="config-hint">
        单价为每 1,000 个 token
        的积分。发送时先预留本轮最多可能消耗的积分，回复完成后按实际输入、输出
        token 扣除，多余部分退回。两项都为 0 时按「基础信息 →
        消耗积分」每次计费。
      </p>
      <div className="config-grid">
        <NumberField
          label="输入单价（积分 / 千 token）"
          value={s.tokenInputPrice || 0}
          max={1000}
          onChange={(tokenInputPrice) => onChange({ tokenInputPrice })}
        />
        <NumberField
          label="输出单价（积分 / 千 token）"
          value={s.tokenOutputPrice || 0}
          max={1000}
          onChange={(tokenOutputPrice) => onChange({ tokenOutputPrice })}
        />
        <NumberField
          label="单次回复上限（token）"
          value={s.maxOutputTokens || 0}
          max={32768}
          integer
          hint="0 表示 4096；上限越大，发送时预留的积分越多。"
          onChange={(maxOutputTokens) => onChange({ maxOutputTokens })}
        />
      </div>
      {!priced && (
        <p className="config-hint">
          当前按次计费：每次对话消耗 {m.points} 积分。
        </p>
      )}
    </Card>
  );
}
