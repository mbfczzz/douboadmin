import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api, type Row, type Model } from "../api";
import type { PageProps } from "../navigation";
import { useCachedRecordPage } from "../hooks/useRecordPage";
import { useResource } from "../hooks/useResource";
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
import ModelOrder from "../models/ModelOrder";
import RelayBalance, { type ManagedBalance } from "../models/RelayBalance";
import { modelSections, type ModelSection } from "../models/sections";
import { ask } from "../confirm/ask";
import { restoreModel, purgeModel } from "../models/restore";

export default function Models({ notify }: PageProps) {
  const [kind, setKind] = useRememberedState("models.kind", ""),
    [q, setQ] = useRememberedState("models.query", ""),
    [page, setPage] = useState(1),
    [deleted, setDeleted] = useState(false);
  const resource = useCachedRecordPage<Model>(
    `/admin/models?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}${deleted ? "&deleted=true" : ""}`,
    page,
  );
  const balance = useResource<ManagedBalance>("/admin/models/balance");
  async function refresh() {
    await Promise.all([resource.reload(), balance.reload()]);
  }
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
        hidden?: number;
      }>("/admin/models/sync", { method: "POST" });
      notify(
        `同步完成：新增 ${r.created}，更新 ${r.updated}${r.hidden ? `（其中 ${r.hidden} 个已删除模型保持隐藏，可在“已删除模型”中恢复）` : ""}${r.conflicts ? `，${r.conflicts} 项发生冲突，请刷新后重试` : ""}`,
      );
      await resource.reload();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  async function changeDeleted(row: Row<Model>, permanent = false) {
    if (busy) return;
    setBusy(row.id);
    try {
      if ((await (permanent ? purgeModel(row) : restoreModel(row))) !== false) {
        await resource.reload();
        notify(
          permanent
            ? "模型已彻底删除，原配置不可恢复"
            : "模型已恢复，可切换到当前模型查看",
        );
      }
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
        loading={resource.loading || balance.loading}
        onRefresh={refresh}
      />
      <section className="panel catalog-panel">
        <div className="catalog-head">
          <div>
            <h2>{deleted ? "已删除模型" : "模型目录"}</h2>
            <p>
              {resource.data ? (
                <>
                  共 {resource.data.total} 个
                  {!deleted && (
                    <>
                      {" "}
                      · 本页已上架{" "}
                      {
                        rows.filter((r) => r.data.published && r.data.available)
                          .length
                      }
                    </>
                  )}
                </>
              ) : resource.loading ? (
                "正在加载模型…"
              ) : (
                "读取失败"
              )}
            </p>
          </div>
          <div className="catalog-actions model-catalog-actions">
            <RelayBalance resource={balance} />
            {!deleted && (
              <ModelOrder
                kind={kind}
                disabled={!!busy}
                onSaved={() => {
                  notify("排序已保存，小程序将按新顺序展示模型");
                  void resource.reload();
                }}
              />
            )}
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
          <select
            aria-label="模型范围"
            value={deleted ? "deleted" : "current"}
            onChange={(e) => {
              setDeleted(e.target.value === "deleted");
              setPage(1);
            }}
          >
            <option value="current">当前模型</option>
            <option value="deleted">已删除模型</option>
          </select>
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
              placeholder="搜索模型名称"
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
              onRestore={(r) => void changeDeleted(r)}
              onPurge={(r) => void changeDeleted(r, true)}
            />
          )}
          {!filtered.length && !resource.loading && !resource.error && (
            <Empty
              text={
                deleted
                  ? "没有匹配的已删除模型"
                  : q || kind
                    ? "没有匹配的模型"
                    : "还没有模型"
              }
              help={
                deleted
                  ? "恢复后会回到当前模型列表，同步上游不会自动恢复删除记录。"
                  : q || kind
                    ? "请调整搜索词或模型类型；此前删除的模型请切换范围查看。"
                    : "可同步上游导入模型；若之前删除过，请切换到已删除模型恢复。"
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
