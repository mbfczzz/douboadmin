import type { Template } from "../api";

export default function TemplateImages({
  value,
  onChange,
}: {
  value: Template;
  onChange: (patch: Partial<Template>) => void;
}) {
  if (!value.imageSlots?.length)
    return (
      <label>
        必填参考图片
        <input
          type="number"
          min={0}
          max={5}
          step={1}
          value={value.requiredImages}
          required
          onChange={(e) =>
            onChange({ requiredImages: Number(e.target.value), mode: "" })
          }
        />
      </label>
    );
  function patch(
    index: number,
    field: "label" | "optional",
    next: string | boolean,
  ) {
    const imageSlots = value.imageSlots!.map((slot, i) =>
      i === index ? { ...slot, [field]: next } : slot,
    );
    onChange({
      imageSlots,
      requiredImages: imageSlots.filter((slot) => !slot.optional).length,
    });
  }
  return (
    <div>
      <p>参考图片用途（位置顺序与提示词编号对应）</p>
      {value.imageSlots.map((slot, index) => (
        <div className="form-grid" key={index}>
          <label>
            图片 {index + 1}
            <input
              value={slot.label}
              maxLength={80}
              onChange={(e) => patch(index, "label", e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={slot.optional}
              onChange={(e) => patch(index, "optional", e.target.checked)}
            />
            选填
          </label>
        </div>
      ))}
    </div>
  );
}
