import { Card, Chips, NumberField, Section } from "./fields";
import {
  effectiveModel,
  modeLabels,
  qualityLabels,
  type SettingsProps,
} from "./settings";

function ReferenceLimits({
  model: m,
  onChange,
  prefix,
  label,
  types = ["image"],
}: SettingsProps & { prefix: string; label: string; types?: string[] }) {
  const limits = m.settings.refLimits || {},
    flags = m.settings.omniReferences || {};
  const set = (key: string, value: number) =>
    onChange({ refLimits: { ...limits, [key]: value } });
  return (
    <Section label={label} hint="0 沿用平台与上游限制；单个文件最多 50 MB">
      {types
        .filter((t) => m.referenceTypes.includes(t))
        .map((typ) => {
          const name = (
            { image: "参考图", video: "参考视频", audio: "参考音频" } as Record<
              string,
              string
            >
          )[typ];
          const enabled = flags[typ] !== false;
          return (
            <div key={typ} className="config-reference">
              {prefix === "omniRef" && (
                <label className="config-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      onChange({
                        omniReferences: { ...flags, [typ]: e.target.checked },
                      })
                    }
                  />
                  <span>{name}</span>
                  <small>{enabled ? "支持" : "不支持"}</small>
                </label>
              )}
              {(prefix !== "omniRef" || enabled) && (
                <div className="config-grid">
                  <NumberField
                    label={`${prefix === "omniRef" ? "全能参考 · " : label + " · "}${name}数量`}
                    span={2}
                    integer
                    max={20}
                    value={limits[prefix + "." + typ + "Count"] || 0}
                    onChange={(n) => set(prefix + "." + typ + "Count", n)}
                  />
                  <NumberField
                    label={`${prefix === "omniRef" ? "全能参考 · " : label + " · "}${name}大小（MB）`}
                    span={2}
                    max={50}
                    value={limits[prefix + "." + typ + "SizeMB"] || 0}
                    onChange={(n) => set(prefix + "." + typ + "SizeMB", n)}
                  />
                </div>
              )}
            </div>
          );
        })}
    </Section>
  );
}

export default function Capabilities({ model: m, onChange }: SettingsProps) {
  const e = effectiveModel(m),
    s = m.settings,
    image = m.kind === "image",
    video = m.kind === "video";
  if (!image && !video) return null;
  const resolutionOptions = [
    ...new Set([
      ...(image
        ? ["auto", "1k", "2k", "4k"]
        : ["480p", "720p", "1080p", "2k", "4k"]),
      ...m.resolutions,
    ]),
  ];
  const ratios = [
    ...new Set([
      "1:1",
      "3:2",
      "2:3",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "21:9",
      ...m.ratios,
    ]),
  ];
  return (
    <Card title="生成能力">
      <Section
        label="支持的生成方式"
        hint="在上游能力范围内配置；不勾选则沿用上游全部模式"
      >
        <Chips
          options={m.modes}
          selected={s.modes || m.modes}
          labels={modeLabels}
          onChange={(modes) => onChange({ modes })}
        />
      </Section>
      {video && (
        <Section
          label="视频生成计费"
          hint="按次模式按输出清晰度定价；按时长模式使用时长 × 清晰度矩阵，切换不删除已有价格。"
        >
          <label className="config-toggle">
            <input
              type="checkbox"
              checked={s.videoBillingMode === "per_request"}
              onChange={(e) =>
                onChange({
                  videoBillingMode: e.target.checked
                    ? "per_request"
                    : "duration",
                })
              }
            />
            <span>
              {s.videoBillingMode === "per_request" ? "按次计费" : "按时长计费"}
            </span>
          </label>
        </Section>
      )}
      {image && e.modes.includes("i2i") && (
        <Section label="图生图参数">
          <div className="config-grid">
            <NumberField
              label="最大参考图数量"
              span={2}
              integer
              max={20}
              value={s.maxRefImages || 0}
              onChange={(maxRefImages) => onChange({ maxRefImages })}
              hint="0 沿用上游数量限制"
            />
            <NumberField
              label="单张参考图大小（MB）"
              span={2}
              max={50}
              value={s.maxRefImageSizeMB || 0}
              onChange={(maxRefImageSizeMB) => onChange({ maxRefImageSizeMB })}
              hint="0 沿用平台 50 MB 限制"
            />
          </div>
        </Section>
      )}
      {video && e.modes.includes("i2v") && (
        <ReferenceLimits
          model={m}
          onChange={onChange}
          prefix="i2v"
          label="图生视频 · 参考图"
        />
      )}
      {video && e.modes.includes("keyframe") && (
        <ReferenceLimits
          model={m}
          onChange={onChange}
          prefix="keyframe"
          label="首尾帧 · 参考图"
        />
      )}
      {video && e.modes.includes("omni_ref") && (
        <ReferenceLimits
          model={m}
          onChange={onChange}
          prefix="omniRef"
          label="全能参考 · 素材能力与限制"
          types={["image", "video", "audio"]}
        />
      )}
      {image && (
        <Section
          label="支持画质"
          hint={
            !m.qualities.length ? "该模型由上游固定画质，无需选择" : undefined
          }
        >
          <Chips
            options={[...new Set(["low", "medium", "high", ...m.qualities])]}
            allowed={m.qualities}
            selected={s.qualities || m.qualities}
            labels={qualityLabels}
            onChange={(qualities) => onChange({ qualities })}
          />
        </Section>
      )}
      {video && (
        <Section label="支持时长">
          <Chips
            options={m.durations.map((d) => d + "s")}
            selected={(s.durations || m.durations).map((d) => d + "s")}
            onChange={(d) => onChange({ durations: d.map((x) => parseInt(x)) })}
          />
        </Section>
      )}
      <Section label="支持清晰度">
        <Chips
          options={resolutionOptions}
          allowed={m.resolutions}
          selected={s.resolutions || m.resolutions}
          labels={Object.fromEntries(
            resolutionOptions.map((r) => [
              r,
              r === "auto" ? "自动" : r.toUpperCase(),
            ]),
          )}
          onChange={(resolutions) => onChange({ resolutions })}
        />
      </Section>
      <Section
        label="支持比例"
        hint="灰色项为上游未开放的能力，已选项会同步到小程序。"
      >
        <Chips
          options={ratios}
          allowed={m.ratios}
          selected={s.ratios || m.ratios}
          onChange={(ratios) => onChange({ ratios })}
        />
      </Section>
    </Card>
  );
}
