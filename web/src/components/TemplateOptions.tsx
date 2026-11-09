import type { Row, Template, Model } from "../api";
import { effectiveModel } from "../models/settings";
export default function TemplateOptions({
  value: v,
  models,
  onChange,
}: {
  value: Template;
  models: Row<Model>[];
  onChange: (p: Partial<Template>) => void;
}) {
  const available = models
    .map((r) => ({ ...r, data: effectiveModel(r.data) }))
    .filter((r) => r.data.kind === v.kind && r.data.available);
  const current = available.find((r) => r.id === v.model)?.data;
  function select(id: string) {
    const m = available.find((r) => r.id === id)?.data;
    onChange({
      model: id,
      resolution: m?.resolutions[0] || "",
      ratio: m?.ratios[0] || "",
      quality: m?.qualities[0] || "",
      duration: m?.durations?.[0] || 0,
      mode: "",
    });
  }
  const choice = (
    key: "resolution" | "ratio" | "quality" | "mode",
    label: string,
    values: string[],
  ) => (
    <label key={key}>
      {label}
      <select
        value={v[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      >
        <option value="">{key === "mode" ? "按素材自动选择" : "未选择"}</option>
        {values.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="form-grid">
        <label>
          生成类型
          <select
            value={v.kind}
            onChange={(e) =>
              onChange({
                kind: e.target.value,
                model: "",
                resolution: "",
                ratio: "",
                quality: "",
                duration: 0,
                mode: "",
              })
            }
          >
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
        </label>
        <label>
          关联模型
          <select value={v.model} onChange={(e) => select(e.target.value)}>
            <option value="">请选择模型</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.data.name}
                {!r.data.published ? "（已下架）" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {current && (
        <div className="form-grid">
          {current.resolutions.length > 0 &&
            choice("resolution", "分辨率", current.resolutions)}
          {current.ratios.length > 0 && choice("ratio", "画幅", current.ratios)}
          {current.qualities.length > 0 &&
            choice("quality", "质量", current.qualities)}
          {current.modes.length > 0 &&
            choice(
              "mode",
              "生成方式",
              current.modes.filter((m) =>
                ["t2i", "i2i", "t2v", "i2v", "keyframe", "omni_ref"].includes(
                  m,
                ),
              ),
            )}
          {!!current.durations?.length && (
            <label>
              视频时长
              <select
                value={v.duration}
                onChange={(e) => onChange({ duration: Number(e.target.value) })}
              >
                {current.durations.map((d) => (
                  <option key={d} value={d}>
                    {d} 秒
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {!available.length && (
        <p className="quiet">请先在模型管理中同步此类型的模型。</p>
      )}
    </>
  );
}
