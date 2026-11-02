import { Plus, Trash2 } from "lucide-react";
import { Card, NumberField, Section } from "./fields";
import type { SettingsProps } from "./settings";

export default function PromptFields({ model, onChange }: SettingsProps) {
  const s = model.settings,
    ideas = s.ideas || [];
  return (
    <Card title="提示词配置">
      <Section
        label="提示词字数限制"
        hint="0 沿用当前小程序的 500 字上限。超限请求会在提交上游前拦截。"
      >
        <div className="config-grid">
          <NumberField
            label="最大提示词字数"
            value={s.maxPromptChars || 0}
            max={500}
            integer
            onChange={(maxPromptChars) => onChange({ maxPromptChars })}
          />
        </div>
      </Section>
      <Section
        label="默认提示词"
        hint="仅在创作输入框为空时填入，不覆盖用户正在编辑的内容。"
      >
        <textarea
          aria-label="默认提示词"
          rows={3}
          value={s.defaultPrompt || ""}
          maxLength={500}
          onChange={(e) => onChange({ defaultPrompt: e.target.value })}
          placeholder="填写该模型的默认创作描述"
        />
      </Section>
      <Section label="灵感提示词" hint="创作页可点选填入的提示词，每行一条。">
        {ideas.map((idea, i) => (
          <div className="config-inline" key={i}>
            <input
              aria-label={`灵感提示词 ${i + 1}`}
              value={idea}
              maxLength={500}
              onChange={(e) =>
                onChange({
                  ideas: ideas.map((v, n) => (i === n ? e.target.value : v)),
                })
              }
              placeholder={`灵感提示词 ${i + 1}`}
            />
            <button
              type="button"
              onClick={() =>
                onChange({ ideas: ideas.filter((_, n) => n !== i) })
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
          disabled={ideas.length >= 10}
          onClick={() => onChange({ ideas: [...ideas, ""] })}
        >
          <Plus size={14} />
          添加灵感词
        </button>
      </Section>
    </Card>
  );
}
