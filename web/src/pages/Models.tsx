import { useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api, type Row, type Model } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import ModelEditor, {
  ModelImport,
  modelKinds,
  supportedModel,
} from "../components/ModelEditor";
import { ModelIcon } from "../models/brands";

export default function Models({ notify }: PageProps) {
  const resource = useResource<Row<Model>[]>("/admin/models");
  const [kind, setKind] = useRememberedState("models.kind", ""),
    [q, setQ] = useRememberedState("models.query", ""),
    [page, setPage] = useState(1);
  const [busy, setBusy] = useState(""),
    [edit, setEdit] = useState<Row<Model> | null>(null),
    [adding, setAdding] = useState(false);
  const rows = resource.data || [];
  const filtered = rows.filter(
    (r) =>
      (!kind || r.data.kind === kind) &&
      [r.data.name, r.data.key].some((s) =>
        s.toLowerCase().includes(q.toLowerCase()),
      ),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  async function sync() {
    if (busy) return;
    setBusy("sync");
    try {
      const r = await api<{
        created: number;
        updated: number;
        conflicts: number;
      }>("/admin/models/sync", { method: "POST" });
      notify(
        `同步完成：新增 ${r.created}，更新 ${r.updated}${r.conflicts ? `，${r.conflicts} 项发生冲突，请刷新后重试` : ""}`,
      );
      await resource.reload();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  async function mutate(r: Row<Model>, remove = false) {
    if (busy) return;
    if (
      remove &&
      !confirm(
        `删除「${r.data.name}」？历史任务会保留，关联模板将无法继续生成。`,
      )
    )
      return;
    setBusy(r.id);
    try {
      await api("/admin/models/" + r.id, {
        method: remove ? "DELETE" : "PUT",
        body: JSON.stringify({
          version: r.version,
          ...(!remove
            ? { data: { ...r.data, published: !r.data.published } }
            : {}),
        }),
      });
      await resource.reload();
      notify(
        remove ? "模型已删除" : r.data.published ? "模型已下架" : "模型已上架",
      );
    } catch (e) {
      notify((e as Error).message, "error");
      void resource.reload();
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="catalog-page">
      <PageHeader
        page="models"
        loading={resource.loading}
        onRefresh={resource.reload}
      />
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      <section className="panel catalog-panel">
        <div className="catalog-head">
          <div>
            <h2>模型目录</h2>
            <p>
              共 {rows.length} 个 · 已上架{" "}
              {rows.filter((r) => r.data.published && r.data.available).length}
            </p>
          </div>
          <div className="catalog-actions">
            <button className="secondary" onClick={sync} disabled={!!busy}>
              <RefreshCw size={15} className={busy === "sync" ? "spin" : ""} />
              {busy === "sync" ? "同步中…" : "同步上游"}
            </button>
            <button className="primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              新增模型
            </button>
          </div>
        </div>
        <div className="catalog-toolbar">
          <div className="catalog-tabs" role="tablist" aria-label="模型类型">
            {[["", "全部"], ...Object.entries(modelKinds)].map(
              ([id, label]) => (
                <button
                  role="tab"
                  aria-selected={kind === id}
                  className={kind === id ? "active" : ""}
                  key={id}
                  onClick={() => {
                    setKind(id);
                    setPage(1);
                  }}
                >
                  {label}
                  {id ? "模型" : ""}
                </button>
              ),
            )}
          </div>
          <label className="catalog-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="搜索模型"
              placeholder="搜索名称或模型 ID"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="table-scroll" key={current + kind + q}>
          <table className="catalog-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>类型</th>
                <th className="wide-only">上游基础消耗</th>
                <th className="wide-only">生成积分配置</th>
                <th
                  className="wide-only"
                  title="最近 200 条生成任务中的使用次数"
                >
                  任务数<small className="cell-note">最近 200 条</small>
                </th>
                <th>状态</th>
                <th className="table-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((current - 1) * 20, current * 20).map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="model-cell">
                      <span className="catalog-icon">
                        <ModelIcon model={r.data} />
                      </span>
                      <div>
                        <b>{r.data.name}</b>
                        <small>{r.data.key}</small>
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
                  <td>{modelKinds[r.data.kind] || r.data.kind}</td>
                  <td className="wide-only">{r.data.creditCost} 点起</td>
                  <td className="wide-only">
                    {r.data.points}
                    <small className="cell-note">尚未扣费</small>
                  </td>
                  <td className="wide-only">{r.data.recentJobs}</td>
                  <td>
                    <div className="model-state">
                      <button
                        type="button"
                        role="switch"
                        aria-label={`${r.data.name} 上架状态`}
                        aria-checked={r.data.published && r.data.available}
                        disabled={
                          !!busy || !supportedModel(r.data) || !r.data.available
                        }
                        onClick={() => void mutate(r)}
                        className={
                          "catalog-switch " +
                          (r.data.published && r.data.available ? "on" : "")
                        }
                      >
                        <span />
                      </button>
                      <span
                        className={
                          "catalog-status " +
                          (r.data.published && r.data.available ? "live" : "")
                        }
                      >
                        {r.data.settings?.availabilityStatus === "maintenance"
                          ? "维护中"
                          : !r.data.available
                            ? "上游不可用"
                            : !supportedModel(r.data)
                              ? "未开放创作"
                              : r.data.published
                                ? "已上架"
                                : "已下架"}
                      </span>
                    </div>
                  </td>
                  <td className="table-actions">
                    <div className="catalog-actions">
                      <button onClick={() => setEdit(r)}>配置</button>
                      <button
                        className="danger-text"
                        disabled={!!busy}
                        onClick={() => void mutate(r, true)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && !resource.loading && !resource.error && (
          <Empty
            text={q || kind ? "没有匹配的模型" : "还没有模型"}
            help={
              q || kind
                ? "请调整搜索词或模型类型。"
                : "点击同步上游，导入当前密钥可用的模型与参数。"
            }
          />
        )}
        <Pagination total={filtered.length} page={current} onChange={setPage} />
      </section>
      {edit && (
        <ModelEditor
          row={edit}
          onClose={() => setEdit(null)}
          onSaved={() => void resource.reload()}
        />
      )}
      {adding && (
        <ModelImport
          onClose={() => setAdding(false)}
          onSaved={() => void resource.reload()}
        />
      )}
    </div>
  );
}
