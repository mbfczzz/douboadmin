import type { Model, Row } from "../api";
import type { ConfirmationOptions } from "../confirmation/request";
import { modeLabels, qualityLabels } from "../models/settings";

// Readable change summary for a template save.
export function templateSummary(
  models: Row<Model>[],
): Pick<ConfirmationOptions, "title" | "labels" | "format"> {
  const file = (v: unknown) => String(v).split("/").pop() || String(v);
  return {
    title: "确认修改模板",
    labels: {
      category: "分类",
      description: "描述",
      family: "模板类型",
      kind: "类型",
      model: "模型",
      mode: "生成方式",
      resolution: "分辨率",
      ratio: "比例",
      quality: "画质",
      duration: "时长（秒）",
      requiredImages: "必填参考图片",
      cover: "封面地址",
      coverAssetId: "封面图片",
      preview: "预览视频",
    },
    format: {
      model: (v) => models.find((m) => m.id === v)?.data.name || String(v),
      mode: (v) => modeLabels[String(v)] || String(v),
      quality: (v) => qualityLabels[String(v)] || String(v),
      kind: (v) =>
        v === "video" ? "视频" : v === "image" ? "图片" : String(v),
      family: (v) => (v === "inspiration" ? "灵感做同款" : "风格主题"),
      cover: file,
      coverAssetId: () => "已上传新图片",
      preview: file,
    },
  };
}
