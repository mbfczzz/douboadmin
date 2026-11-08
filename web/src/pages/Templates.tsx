import { useState } from "react";
import { Plus, Layers, Lightbulb, Search, Image, Film } from "lucide-react";
import { api, type Row, type Template, type Model } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import TemplateCard from "../components/TemplateCard";
import TemplateEditor from "../components/TemplateEditor";

const blank: Template = {
  title: "",
  category: "",
  kind: "image",
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
  const resource = useResource<Row<Template>[]>("/admin/templates"),
    models = useResource<Row<Model>[]>("/admin/models");
  const [family, setFamily] = useRememberedState("templates.family", "style"),
    [kind, setKind] = useRememberedState("templates.kind", "image"),
    [status, setStatus] = useRememberedState("templates.status", ""),
    [category, setCategory] = useRememberedState("templates.category", ""),
    [q, setQ] = useRememberedState("templates.query", ""),
    [sort, setSort] = useRememberedState("templates.sort", "sort"),
    [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Row<Template> | null>(null),
    [busy, setBusy] = useState("");
  const rows = resource.data || [],
    modelRows = models.data || [];
  const filtered = rows
    .filter(
      (r) =>
        (r.data.family || "style") === family &&
        r.data.kind === kind &&
        (!status || (status === "published") === r.data.published) &&
        (!category || r.data.category === category) &&
        [r.data.title, r.data.prompt].some((s) => s.includes(q)),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.data.sort - b.data.sort,
    );
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  function create(data = blank) {
    setEdit({
      id: crypto.randomUUID(),
      version: 0,
      createdAt: "",
      data: { ...data, kind, family, published: false },
    });
  }
  async function action(row: Row<Template>, remove = false) {
    if (busy) return;
    if (remove && !confirm(`删除模板「${row.data.title}」？`)) return;
    setBusy(row.id);
    try {
      await api("/admin/templates/" + row.id, {
        method: remove ? "DELETE" : "PUT",
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
          新增模板
        </button>
      </PageHeader>
      <RequestState
        loading={
          (resource.loading && !resource.data) ||
          (models.loading && !models.data)
        }
        error={resource.error || models.error}
        retry={() => {
          void resource.reload();
          void models.reload();
        }}
      />
      <div className="template-families">
        {[
          ["style", "风格主题", "预设画面风格、生成参数与参考素材", Layers],
          [
            "inspiration",
            "灵感做同款",
            "展示作品，使用模板提示词创作",
            Lightbulb,
          ],
        ].map(([id, title, desc, Icon]) => {
          const I = Icon as typeof Layers;
          return (
            <button
              key={String(id)}
              className={family === id ? "selected" : ""}
              onClick={() => {
                setFamily(String(id));
                setPage(1);
              }}
            >
              <I size={21} />
              <span>
                <b>{String(title)}</b>
                <small>{String(desc)}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="catalog-toolbar panel">
        <div className="catalog-tabs">
          {[
            ["image", "图片", Image],
            ["video", "视频", Film],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Film;
            return (
              <button
                className={kind === id ? "active" : ""}
                key={String(id)}
                onClick={() => {
                  setKind(String(id));
                  setPage(1);
                }}
              >
                <I size={14} />
                {String(label)}
              </button>
            );
          })}
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
          {[...new Set(rows.map((r) => r.data.category))]
            .filter(Boolean)
            .map((c) => (
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
          {category || "全部分类"} · {filtered.length} 个模板
        </span>
        <select
          aria-label="模板排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="sort">默认排序</option>
          <option value="newest">最近添加</option>
        </select>
      </div>
      <div className="studio-grid">
        {filtered.slice((current - 1) * 12, current * 12).map((r) => (
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
          total={filtered.length}
          size={12}
          page={current}
          onChange={setPage}
        />
      </div>
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
