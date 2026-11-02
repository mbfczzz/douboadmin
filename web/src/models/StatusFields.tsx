import { Plus, Trash2 } from "lucide-react";
import { Card, Field, Section } from "./fields";
import {
  supportedModel,
  type ModelDraft,
  type SettingsProps,
} from "./settings";

export function ErrorFields({ model, onChange }: SettingsProps) {
  const hints = model.settings.errorHints || [];
  return (
    <Card title="错误提示映射">
      <Section
        label="按原始错误片段自定义用户提示"
        hint="包含匹配片段时，使用右侧提示；不区分大小写，按列表顺序匹配。"
      >
        {hints.map((h, i) => (
          <div className="config-inline" key={i}>
            <input
              aria-label={`错误匹配片段 ${i + 1}`}
              value={h.contains}
              maxLength={200}
              placeholder="如：insufficient balance"
              onChange={(e) =>
                onChange({
                  errorHints: hints.map((x, n) =>
                    n === i ? { ...x, contains: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              aria-label={`用户提示文案 ${i + 1}`}
              value={h.message}
              maxLength={300}
              placeholder="用户看到的说明"
              onChange={(e) =>
                onChange({
                  errorHints: hints.map((x, n) =>
                    n === i ? { ...x, message: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              onClick={() =>
                onChange({ errorHints: hints.filter((_, n) => n !== i) })
              }
            >
              <Trash2 size={14} />
              移除
            </button>
          </div>
        ))}
        <button
          type="button"
          className="config-ghost"
          disabled={hints.length >= 20}
          onClick={() =>
            onChange({ errorHints: [...hints, { contains: "", message: "" }] })
          }
        >
          <Plus size={14} />
          添加映射
        </button>
      </Section>
    </Card>
  );
}

export function StatusFields({
  model: m,
  onChange,
}: {
  model: ModelDraft;
  onChange: (v: ModelDraft) => void;
}) {
  return (
    <Card title="状态">
      <div className="config-grid">
        <Field label="上下架状态" span={2}>
          <select
            aria-label="上下架状态"
            value={m.published ? "on" : "off"}
            onChange={(e) =>
              onChange({ ...m, published: e.target.value === "on" })
            }
          >
            <option value="on" disabled={!m.available || !supportedModel(m)}>
              已上架
            </option>
            <option value="off">已下架</option>
          </select>
        </Field>
        <Field label="运行状态" span={2} hint="维护期间禁止新建生成任务">
          <select
            aria-label="运行状态"
            value={m.settings.availabilityStatus || "normal"}
            onChange={(e) =>
              onChange({
                ...m,
                settings: {
                  ...m.settings,
                  availabilityStatus: e.target.value as
                    "normal" | "maintenance",
                },
              })
            }
          >
            <option value="normal">正常</option>
            <option value="maintenance">异常（维护中）</option>
          </select>
        </Field>
      </div>
      {!supportedModel(m) && (
        <p className="config-hint">
          此类型暂未在小程序开放创作，可先维护目录信息。
        </p>
      )}
    </Card>
  );
}
