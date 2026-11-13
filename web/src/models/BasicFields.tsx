import { Plus, Trash2 } from "lucide-react";
import { Card, Field, NumberField, Section } from "./fields";
import { brands, brandURL } from "./brands";
import { modelKinds, type ModelDraft } from "./settings";
import { useBrandAssets } from "../hooks/useBrandAssets";

export default function BasicFields({
  model: m,
  onChange,
}: {
  model: ModelDraft;
  onChange: (m: ModelDraft) => void;
}) {
  const { modelIcons } = useBrandAssets();
  const s = m.settings,
    badges = s.badges || [];
  const patch = (v: Partial<typeof s>) =>
    onChange({ ...m, settings: { ...s, ...v } });
  return (
    <Card title="基础信息">
      <div className="config-grid">
        <Field label="名称" span={4}>
          <input
            aria-label="名称"
            value={m.name}
            onChange={(e) => onChange({ ...m, name: e.target.value })}
            required
            maxLength={100}
          />
        </Field>
        <Field label="类型">
          <select aria-label="类型" value={m.kind} disabled>
            <option value={m.kind}>{modelKinds[m.kind]}</option>
          </select>
        </Field>
        <NumberField
          label={m.kind === "video" ? "兜底积分" : "消耗积分"}
          value={m.points}
          onChange={(points) => onChange({ ...m, points })}
          hint="按次积分配置，支持小数"
        />
        <Field label="成本价（USD）" hint="仅后台参考，不向小程序展示">
          <input
            aria-label="成本价（USD）"
            type="number"
            min={0}
            max={1e9}
            step="any"
            value={s.costUsd || ""}
            placeholder="0.0000"
            onChange={(e) => patch({ costUsd: e.target.value })}
          />
        </Field>
        <NumberField
          label="显示顺序"
          value={m.sort}
          integer
          onChange={(sort) => onChange({ ...m, sort })}
          hint="数值越小，展示越靠前"
        />
        <div className="col-4">
          <Section
            label="图标"
            hint="点选品牌图标，或填写字符 / HTTPS 图片地址；留空自动匹配品牌"
          >
            <div className="config-brands">
              {brands.map(([slug, name]) => (
                <button
                  type="button"
                  key={slug}
                  title={name}
                  aria-label={name}
                  aria-pressed={s.icon === brandURL(slug)}
                  onClick={() =>
                    patch({
                      icon: s.icon === brandURL(slug) ? "" : brandURL(slug),
                    })
                  }
                >
                  {modelIcons[brandURL(slug)] ? (
                    <img
                      src={modelIcons[brandURL(slug)]}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span aria-hidden="true">{name.slice(0, 1)}</span>
                  )}
                </button>
              ))}
            </div>
            <input
              aria-label="自定义图标字符或图片 URL"
              value={s.icon || ""}
              onChange={(e) => patch({ icon: e.target.value })}
              placeholder="字符或图片 URL（留空自动匹配品牌图标）"
            />
          </Section>
        </div>
        <Field label="描述" span={2} hint="模型选择列表名称下的副标题（选填）">
          <input
            aria-label="描述"
            value={s.description || ""}
            maxLength={500}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="如：适合产品摄影与精细图像编辑"
          />
        </Field>
        <NumberField
          label="预计耗时（秒）"
          value={s.estSeconds || 0}
          integer
          max={86400}
          onChange={(estSeconds) => patch({ estSeconds })}
          hint="0 = 不显示耗时提示"
        />
      </div>
      <Section label="模型标签" hint="模型名称旁的小标签，建议不超过 2 个">
        {badges.map((b, i) => (
          <div className="config-inline" key={i}>
            <select
              aria-label={`标签 ${i + 1} 样式`}
              value={b.tone}
              onChange={(e) =>
                patch({
                  badges: badges.map((x, n) =>
                    n === i
                      ? { ...x, tone: e.target.value as typeof b.tone }
                      : x,
                  ),
                })
              }
            >
              <option value="hot">红色 · 热门类</option>
              <option value="new">青色 · 新品类</option>
              <option value="info">灰字 · 说明类</option>
            </select>
            <input
              aria-label={`标签 ${i + 1} 文本`}
              value={b.text}
              maxLength={16}
              required
              onChange={(e) =>
                patch({
                  badges: badges.map((x, n) =>
                    n === i ? { ...x, text: e.target.value } : x,
                  ),
                })
              }
              placeholder="如：热门 / 新品"
            />
            <button
              type="button"
              onClick={() =>
                patch({ badges: badges.filter((_, n) => n !== i) })
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
          disabled={badges.length >= 4}
          onClick={() =>
            patch({ badges: [...badges, { text: "", tone: "info" }] })
          }
        >
          <Plus size={14} />
          添加标签
        </button>
      </Section>
    </Card>
  );
}
