import type { Model, Row } from "../api";
import { ModelIcon } from "./brands";
import ModelState from "./ModelState";
import { modelKinds } from "./settings";
import { modelSections, sectionsFor, type ModelSection } from "./sections";

export default function ModelTable({
  rows,
  busy,
  onEdit,
  onToggle,
  onDelete,
  onRestore,
  onPurge,
}: {
  rows: Row<Model>[];
  busy: boolean;
  onEdit: (row: Row<Model>, section: ModelSection) => void;
  onToggle: (row: Row<Model>) => void;
  onDelete: (row: Row<Model>) => void;
  onRestore: (row: Row<Model>) => void;
  onPurge: (row: Row<Model>) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="catalog-table">
        <thead>
          <tr>
            <th>模型</th>
            <th className="wide-only">类型</th>
            <th
              className="wide-only xl-only"
              title="最近 200 条生成任务中的使用次数"
            >
              任务数<small className="cell-note">最近 200 条</small>
            </th>
            <th>状态</th>
            <th className="table-actions model-actions-head">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="model-cell">
                  <span className="catalog-icon">
                    <ModelIcon model={r.data} />
                  </span>
                  <div>
                    <b>{r.data.name}</b>
                    <div className="model-display-badges">
                      {r.data.settings?.badges?.map((b, i) => (
                        <small className={b.tone} key={i}>
                          {b.text}
                        </small>
                      ))}
                    </div>
                  </div>
                </div>
              </td>
              <td className="wide-only">
                {modelKinds[r.data.kind] || r.data.kind}
              </td>
              <td className="wide-only xl-only">{r.data.recentJobs}</td>
              <td>
                {r.data.deleted ? (
                  <span className="quiet">已删除</span>
                ) : (
                  <ModelState
                    model={r.data}
                    busy={busy}
                    onToggle={() => onToggle(r)}
                  />
                )}
              </td>
              <td className="table-actions">
                <div className="catalog-actions model-row-actions">
                  {r.data.deleted ? (
                    <>
                      <button disabled={busy} onClick={() => onRestore(r)}>
                        恢复模型
                      </button>
                      <button
                        className="danger-text model-delete"
                        disabled={busy}
                        onClick={() => onPurge(r)}
                      >
                        彻底删除
                      </button>
                    </>
                  ) : (
                    <>
                      {sectionsFor(r.data).map((section) => (
                        <button
                          key={section}
                          onClick={() => onEdit(r, section)}
                        >
                          {modelSections[section].button}
                        </button>
                      ))}
                      <button
                        className="danger-text model-delete"
                        disabled={busy}
                        onClick={() => onDelete(r)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
