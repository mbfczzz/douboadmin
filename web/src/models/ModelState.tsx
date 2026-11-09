import type { Model } from "../api";
import { supportedModel } from "./settings";

// Publish switch plus the state label shown in the model table.
export default function ModelState({
  model,
  busy,
  onToggle,
}: {
  model: Model;
  busy: boolean;
  onToggle: () => void;
}) {
  const live = model.published && model.available;
  return (
    <div className="model-state">
      <button
        type="button"
        role="switch"
        aria-label={`${model.name} 上架状态`}
        aria-checked={live}
        disabled={busy || !supportedModel(model) || !model.available}
        onClick={onToggle}
        className={"catalog-switch " + (live ? "on" : "")}
      >
        <span />
      </button>
      <span className={"catalog-status " + (live ? "live" : "")}>
        {model.settings?.availabilityStatus === "maintenance"
          ? "维护中"
          : !model.available
            ? "上游不可用"
            : !supportedModel(model)
              ? "未开放创作"
              : model.published
                ? "已上架"
                : "已下架"}
      </span>
    </div>
  );
}
