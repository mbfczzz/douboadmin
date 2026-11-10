import { cancelled, chooseReferenceFile, error, upload } from "../../utils/api";
import type { Model, Row, Asset } from "../../services/types";

// API upload and request ceilings; model-specific limits can only narrow them.
const maxAssets = 20,
  maxFileMB = 50;
const labels: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};
export function referenceSettings(model: Model) {
  const types = model.referenceTypes || [];
  return {
    allowImage: types.includes("image"),
    allowVideo: types.includes("video"),
    allowAudio: types.includes("audio"),
    maxReferences: !types.length
      ? 0
      : model.kind === "image"
        ? Math.min(
            maxAssets,
            model.referenceRules?.i2i?.image?.maxCount ||
              model.settings?.maxRefImages ||
              maxAssets,
          )
        : maxAssets,
  };
}

export function creationMode(model: Model, assets: Row<Asset>[]): string {
  const modes = model.modes || [];
  const images = assets.filter((a) => a.data.type.startsWith("image/")).length;
  if (model.kind === "image")
    return assets.length
      ? "i2i"
      : modes.includes("t2i") || !modes.length
        ? "t2i"
        : modes[0];
  if (!assets.length)
    return modes.includes("t2v") || !modes.length ? "t2v" : modes[0];
  if (images === 1 && assets.length === 1 && modes.includes("i2v"))
    return "i2v";
  if (modes.includes("omni_ref")) return "omni_ref";
  if (images === assets.length && modes.includes("keyframe")) return "keyframe";
  return images === 1 && assets.length === 1 ? "i2v" : "omni_ref";
}

export function referenceError(
  model: Model,
  assets: Row<Asset>[],
  submitting = false,
): string {
  const settings = model.settings || {};
  if (assets.length > maxAssets) return `最多添加 ${maxAssets} 个参考素材`;
  const counts: Record<string, number> = {};
  for (const asset of assets) {
    const type = asset.data.type.split("/")[0];
    if (model.kind === "image" && type !== "image")
      return "图片创作只支持参考图片，请移除视频或音频";
    if (!(model.referenceTypes || []).includes(type))
      return `此模型不支持参考${labels[type] || "素材"}，请移除或更换模型`;
    counts[type] = (counts[type] || 0) + 1;
  }
  const mode = creationMode(model, assets);
  const prefix = mode === "omni_ref" ? "omniRef" : mode;
  if ((model.modes || []).length && !(model.modes || []).includes(mode))
    return "此模型不支持当前素材组合，请移除素材或更换模型";
  if (
    submitting &&
    ((mode === "keyframe" && counts.image !== 2) ||
      (mode === "i2v" && counts.image !== 1) ||
      (["i2i", "omni_ref"].includes(mode) && !assets.length))
  )
    return mode === "keyframe"
      ? "请添加首帧和尾帧两张图片"
      : "请先添加模型要求的参考素材";
  for (const type of Object.keys(counts)) {
    const rule = model.referenceRules?.[mode]?.[type];
    if (submitting && rule?.minCount && counts[type] < rule.minCount)
      return `此模型至少需要 ${rule.minCount} 个参考${labels[type]}`;
    const configured =
      model.kind === "image"
        ? settings.maxRefImages
        : settings.refLimits?.[prefix + "." + type + "Count"];
    const intrinsic = mode === "i2v" ? 1 : mode === "keyframe" ? 2 : maxAssets;
    const countLimit = Math.min(
      intrinsic,
      rule?.maxCount ?? (configured || maxAssets),
    );
    if (counts[type] > countLimit)
      return `此模型最多支持 ${countLimit} 个参考${labels[type]}`;
    if (
      model.kind === "video" &&
      prefix === "omniRef" &&
      settings.omniReferences?.[type] === false
    )
      return `此模型未开启全能参考${labels[type]}`;
    const configuredMB =
      model.kind === "image"
        ? settings.maxRefImageSizeMB
        : settings.refLimits?.[prefix + "." + type + "SizeMB"];
    const sizeLimit = Math.min(
      maxFileMB,
      rule?.maxSizeMB ?? (configuredMB || maxFileMB),
    );
    if (
      assets.some(
        (a) =>
          a.data.type.startsWith(type + "/") &&
          a.data.size > sizeLimit * 1024 * 1024,
      )
    )
      return `参考${labels[type]}不能超过 ${sizeLimit} MB`;
  }
  return "";
}

import type { ReferenceEditor as Editor } from "./editor-types";
export function selectedModel(page: Editor) {
  return page.data.availableModels.find((m) => m.id === page.data.model);
}

export async function addReference(page: Editor, kind: string) {
  if (
    page.data.uploading ||
    page.data.restoring ||
    page.data.busy ||
    page.data.modelsLoading ||
    page.data.modelError
  )
    return;
  const model = selectedModel(page);
  if (!model || !(model.referenceTypes || []).includes(kind)) {
    error(new Error("当前模型不支持此参考素材"));
    return;
  }
  const revision = page.assetRevision;
  page.setData({ uploading: true });
  try {
    const candidate = {
      id: "new",
      data: { type: kind + "/pending", size: 0 },
    } as Row<Asset>;
    let problem = referenceError(model, [...page.data.assets, candidate]);
    if (problem) throw new Error(problem);
    page.setData({ assetsOpen: false });
    const file = await chooseReferenceFile(kind as "image" | "video" | "audio");
    if (revision !== page.assetRevision) return;
    candidate.data.size = file.size;
    const beforeUpload = selectedModel(page);
    // Returning from the system picker can refresh config concurrently; do not discard the selection merely for loading.
    if (!beforeUpload || page.data.modelError)
      throw new Error("模型配置已更新，请重新选择模型");
    problem = referenceError(beforeUpload, [...page.data.assets, candidate]);
    if (problem) throw new Error(problem);
    const row = await upload(file.path);
    if (revision !== page.assetRevision) return;
    const current = selectedModel(page);
    if (!current) throw new Error("模型配置已更新，请重新选择模型");
    problem = referenceError(current, [...page.data.assets, row]);
    if (problem) throw new Error(problem);
    page.setData({
      assets: [
        ...page.data.assets,
        { ...row, isImage: row.data.type.startsWith("image/") },
      ],
    });
    page.refreshParameters?.();
  } catch (e) {
    if (revision === page.assetRevision && !cancelled(e)) error(e);
  } finally {
    if (revision === page.assetRevision) page.setData({ uploading: false });
  }
}
