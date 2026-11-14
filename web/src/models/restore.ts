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
