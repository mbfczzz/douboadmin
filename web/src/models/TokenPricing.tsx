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
        单价为每 1,000 个 token 的积分，请与服务商官方价格同步（1 元 = 10
        积分时，官方每百万 token 的元价 ÷
        100）。发送时先按高峰价预留本轮最多可能消耗的积分，回复完成后按实际输入（缓存命中部分按缓存价）、输出
        token 扣除，多余部分退回。输入、输出单价都为 0 时按「基础信息 →
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
          label="缓存命中输入单价（积分 / 千 token）"
          value={s.tokenCachedPrice ?? s.tokenInputPrice ?? 0}
          max={1000}
          hint="服务商从缓存读取的输入部分，未单独设置时同输入单价。"
          onChange={(tokenCachedPrice) => onChange({ tokenCachedPrice })}
        />
        <NumberField
          label="高峰时段倍数"
          value={s.peakPriceRate || 1}
          max={10}
          hint="北京时间工作日 9–12 点、14–18 点三项单价乘以此倍数（DeepSeek 为 2）；1 表示不区分。"
          onChange={(peakPriceRate) => onChange({ peakPriceRate })}
        />
        <NumberField
          label="单次回复上限（token）"
          value={s.maxOutputTokens || 0}
          max={32768}
          integer
          hint="0 表示默认 4096（约 3000 汉字，够一份完整方案）；上限越大，发送时预留的积分越多。"
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
