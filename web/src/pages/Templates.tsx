import { useEffect, useState } from "react";
import { Plus, Search, Film } from "lucide-react";
import { api, type Row, type Template, type Model } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useCachedRecordPage } from "../hooks/useRecordPage";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import CatalogResults from "../components/CatalogResults";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import TemplateCard from "../components/TemplateCard";
import TemplateEditor from "../components/TemplateEditor";
import { newId } from "../id";
import { ask } from "../confirm/ask";

const blank: Template = {
  title: "",
  category: "",
  kind: "video",
  cover: "",
  prompt: "",
  description: "",
  published: false,
  sort: 0,
  requiredImages: 0,
  model: "",
  resolution: "",
  ratio: "",
  duration: 0,
  quality: "",
  mode: "",
  family: "style",
};
export default function Templates({ notify }: PageProps) {
  const models = useResource<Row<Model>[]>("/admin/models");
  const kind = "video";
  const [status, setStatus] = useRememberedState("templates.status", ""),
    [category, setCategory] = useRememberedState("templates.category", ""),
    [q, setQ] = useRememberedState("templates.query", ""),
    [sort, setSort] = useRememberedState("templates.sort", "sort"),
    [page, setPage] = useState(1);
  const resource = useCachedRecordPage<Template>(
    `/admin/templates?${new URLSearchParams({ kind, status, category, q, sort })}`,
    page,
    12,
  );
  const categories = useResource<string[]>("/admin/templates/categories");
  const [edit, setEdit] = useState<Row<Template> | null>(null),
    [busy, setBusy] = useState("");
  const rows = resource.data?.items || [],
    modelRows = (models.data || []).filter((r) => r.data.kind === "video");
  // A remembered category whose templates are all gone no longer filters.
  useEffect(() => {
    if (category && categories.data && !categories.data.includes(category)) {
      setCategory("");
      setPage(1);
    }
  }, [category, categories.data, setCategory]);
  useEffect(() => {
    if (resource.data)
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(resource.data!.total / 12))),
      );
  }, [resource.data]);
  const filtered = rows.filter((r) => r.data.kind === "video"),
    current = page;
  function create(data = blank) {
    setEdit({
      id: newId(),
      version: 0,
      createdAt: "",
      data: { ...data, kind, published: false },
    });
  }
  async function action(row: Row<Template>, remove = false) {
    if (busy) return;
    if (
      remove &&
      (await ask({
        title: "删除模板？",
        message: `「${row.data.title}」删除后小程序将不再展示该模板，已生成的作品不受影响。`,
        confirmText: "删除",
        danger: true,
      })) === false
    )
      return;
    setBusy(row.id);
    try {
      await api("/admin/templates/" + row.id, {
        method: remove ? "DELETE" : "PUT",
        confirmation: { before: row.data },
        body: JSON.stringify({
          version: row.version,
          ...(!remove
            ? { data: { ...row.data, published: !row.data.published } }
            : {}),
        }),
      });
      await resource.reload();
      notify(
        remove
          ? "模板已删除"
          : row.data.published
            ? "模板已下架"
            : "模板已发布",
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
        page="templates"
        loading={resource.loading}
        onRefresh={resource.reload}
      >
        <button className="primary" onClick={() => create()}>
          <Plus size={16} />
          新增视频模板
        </button>
      </PageHeader>
      <div className="catalog-toolbar panel">
        <div className="business-actions">
          <Film size={16} />
          <span>视频模板</span>
        </div>
        <select
          aria-label="模板状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="published">已上架</option>
          <option value="draft">草稿 / 已下架</option>
        </select>
        <select
          aria-label="模板分类"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部分类</option>
          {(categories.data || []).filter(Boolean).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="catalog-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="搜索模板"
            placeholder="搜索标题、提示词"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <div className="catalog-caption">
        <span>
          {category || "全部分类"} ·{" "}
          {resource.data
            ? `${resource.data.total} 个模板`
            : resource.loading
              ? "正在加载模板…"
              : "读取失败"}
        </span>
        <select
          aria-label="模板排序"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="sort">默认排序</option>
          <option value="newest">最近添加</option>
        </select>
      </div>
      <CatalogResults
        label="模板列表"
        loading={
          (resource.loading && !resource.data) ||
          (models.loading && !models.data)
        }
        error={resource.error || models.error}
        retry={() => {
          void resource.reload();
          void models.reload();
        }}
      >
        <div className="studio-grid">
          {filtered.map((r) => (
            <TemplateCard
              key={r.id}
              r={r}
              modelRows={modelRows}
              busy={busy}
              onEdit={setEdit}
              onCopy={create}
              onToggle={(r) => void action(r)}
              onDelete={(r) => void action(r, true)}
            />
          ))}
        </div>
        {!filtered.length && !resource.loading && !resource.error && (
          <Empty
            text={q || category || status ? "没有匹配的模板" : "暂无创作模板"}
            help={
              q || category || status
                ? "请调整搜索词、分类或上下架筛选条件。"
                : "创建模板、关联真实模型并上架后，小程序会自动展示。"
            }
          />
        )}
        <div>
          <Pagination
            total={resource.data?.total || 0}
            size={12}
            page={current}
            onChange={setPage}
          />
        </div>
      </CatalogResults>
      {edit && (
        <TemplateEditor
          initial={edit}
          models={modelRows}
          onClose={() => setEdit(null)}
          onSaved={resource.reload}
          notify={notify}
        />
      )}
    </div>
  );
}
