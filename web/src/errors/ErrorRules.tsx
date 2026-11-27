import { useState } from "react";
import { api, date, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import { ask } from "../confirm/ask";
import ErrorRuleEditor from "./ErrorRuleEditor";
import type { Notify } from "../navigation";
import type { ErrorRule } from "./types";
import "./errors.css";

// 错误归档 (日志管理): every filed failure, its match text and what users read.
export default function ErrorRules({
  revision,
  notify,
}: {
  revision: number;
  notify: Notify;
}) {
  const res = useResource<Row<ErrorRule>[]>(`/admin/error-rules?r=${revision}`),
    [editing, setEditing] = useState<Row<ErrorRule> | null>(null);
  async function remove(rule: Row<ErrorRule>) {
    const ok = await ask({
      title: "删除错误归档",
      message: `删除后，包含「${rule.data.contains}」的失败将恢复默认提示（多为「系统异常」）。`,
      confirmText: "删除",
      danger: true,
      run: () =>
        api(`/admin/error-rules/${rule.id}`, {
          method: "DELETE",
          body: JSON.stringify({ version: rule.version }),
          confirmation: false,
        }),
    });
    if (ok === false) return;
    notify("错误归档已删除");
    res.reload();
  }
  return (
    <div className="error-rules">
      <RequestState
        loading={res.loading && !res.data}
        error={res.error}
        retry={res.reload}
      />
      {res.data && (
        <Table
          rows={res.data}
          id={(r) => r.id}
          empty="还没有归档的错误。在生成任务详情的失败原因里点「归档此错误」添加。"
          columns={[
            { title: "匹配内容", render: (r) => r.data.contains },
            { title: "用户看到的提示", render: (r) => r.data.message },
            { title: "建议操作", render: (r) => r.data.action || "—" },
            { title: "创建时间", render: (r) => date(r.createdAt) },
            {
              title: "操作",
              action: true,
              render: (r) => (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditing(r)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => remove(r)}
                  >
                    删除
                  </button>
                </>
              ),
            },
          ]}
        />
      )}
      {editing && (
        <ErrorRuleEditor
          initial={editing}
          notify={notify}
          onClose={() => setEditing(null)}
          onSaved={res.reload}
        />
      )}
    </div>
  );
}
