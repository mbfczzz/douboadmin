import { Chips, Section } from "./fields";
import type { SettingsProps } from "./settings";
import { videoDurations } from "./parameter-options";

export default function DurationChoices({ model, onChange }: SettingsProps) {
  const selected = model.settings.durations || model.durations;
  const options = videoDurations;
  return (
    <Section
      label="支持时长"
      hint="固定为 1–30 秒，至少选择一种时长；按用户实际选择提交，由中转站校验是否支持。"
    >
      <Chips
        minimum={1}
        options={options.map((n) => n + "s")}
        selected={selected.map((n) => n + "s")}
        onChange={(values) =>
          onChange({ durations: values.map((v) => parseInt(v)) })
        }
      />
      <button
        type="button"
        className="config-ghost"
        onClick={() => onChange({ durations: options })}
      >
        全选时长
      </button>
    </Section>
  );
}
