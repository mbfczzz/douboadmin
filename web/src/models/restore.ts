import { api, type Model, type Row } from "../api";
import { ask } from "../confirm/ask";

export function restoreModel(row: Row<Model>) {
  return ask({
    title: "恢复模型？",
    message: `将重新核验「${row.data.name}」的上游能力，保留原名称、定价和配置。支持创作的模型会重新上架。`,
    confirmText: "恢复模型",
    run: () =>
      api("/admin/models", {
        method: "POST",
        confirmation: false,
        body: JSON.stringify({ key: row.data.key, version: row.version }),
      }),
  });
}

export function purgeModel(row: Row<Model>) {
  return ask({
    title: "彻底删除模型？",
    message: `将永久清除「${row.data.name}」的模型记录、定价和配置，无法恢复。历史任务和关联模板保留，模板需重新配置可用模型。之后再次同步上游时，该模型可能按默认配置重新导入。`,
    confirmText: "彻底删除",
    danger: true,
    run: () =>
      api(`/admin/models/${encodeURIComponent(row.id)}/permanent`, {
        method: "DELETE",
        confirmation: false,
        body: JSON.stringify({
          version: row.version,
          createdAt: row.createdAt,
        }),
      }),
  });
}
