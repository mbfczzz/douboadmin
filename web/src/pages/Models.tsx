import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api, type Row, type Model } from "../api";
import type { PageProps } from "../navigation";
import { useCachedRecordPage } from "../hooks/useRecordPage";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import CatalogResults from "../components/CatalogResults";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import ModelEditor, {
  ModelImport,
  modelKinds,
} from "../components/ModelEditor";
import ModelTable from "../models/ModelTable";
import { modelSections, type ModelSection } from "../models/sections";
import { ask } from "../confirm/ask";

export default function Models({ notify }: PageProps) {
  const [kind, setKind] = useRememberedState("models.kind", ""),
    [q, setQ] = useRememberedState("models.query", ""),
    [page, setPage] = useState(1);
  const resource = useCachedRecordPage<Model>(
    `/admin/models?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`,
    page,
  );
  const [busy, setBusy] = useState(""),
    [edit, setEdit] = useState<{ row: Row<Model>; section: ModelSection }>(),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    if (resource.data)
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(resource.data!.total / 20))),
      );
  }, [resource.data]);
  const rows = resource.data?.items || [],
    filtered = rows,
    current = page;
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
      (await ask({
        title: "删除模型？",
        message: `「${r.data.name}」删除后，历史任务会保留，关联模板将无法继续生成。`,
        confirmText: "删除",
        danger: true,
      })) === false
    )
      return;
    setBusy(r.id);
    try {
      await api("/admin/models/" + r.id, {
        method: remove ? "DELETE" : "PUT",
        confirmation: { before: r.data },
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
      <section className="panel catalog-panel">
        <div className="catalog-head">
          <div>
            <h2>模型目录</h2>
            <p>
              {resource.data ? (
                <>
                  共 {resource.data.total} 个 · 本页已上架{" "}
                  {
                    rows.filter((r) => r.data.published && r.data.available)
                      .length
                  }
                </>
              ) : resource.loading ? (
                "正在加载模型…"
              ) : (
                "读取失败"
              )}
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
        <CatalogResults
          label="模型列表"
          loading={resource.loading && !resource.data}
          error={resource.error}
          retry={resource.reload}
        >
          {resource.data && (
            <ModelTable
              rows={filtered}
              busy={!!busy}
              onEdit={(row, section) => setEdit({ row, section })}
              onToggle={(r) => void mutate(r)}
              onDelete={(r) => void mutate(r, true)}
            />
          )}
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
          <Pagination
            total={resource.data?.total || 0}
            page={current}
            onChange={setPage}
          />
        </CatalogResults>
      </section>
      {edit && (
        <ModelEditor
          key={edit.row.id + edit.section}
          row={edit.row}
          section={edit.section}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            notify(`${modelSections[edit.section].title}已保存`);
            void resource.reload();
          }}
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
