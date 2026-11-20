import { useEffect, useState } from "react";
import { Plus, Shirt, Sparkles } from "lucide-react";
import { api, type Outfit } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useCachedRecordPage } from "../hooks/useRecordPage";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import CatalogResults from "../components/CatalogResults";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import OutfitEditor from "../components/OutfitEditor";
import OutfitCard, { type OutfitRow } from "../components/OutfitCard";
import OutfitDefaults from "../components/OutfitDefaults";
import { newId } from "../id";
import { ask } from "../confirm/ask";

const blank: Outfit = {
  title: "",
  category: "",
  description: "",
  imageAssetId: "",
  published: false,
  sort: 0,
};
const SIZE = 12;

// 试衣服装: the clothing library of the mini-program's AI试衣.
export default function Outfits({ notify }: PageProps) {
  const [status, setStatus] = useRememberedState("outfits.status", ""),
    [category, setCategory] = useRememberedState("outfits.category", ""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<OutfitRow | null>(null),
    [busy, setBusy] = useState(""),
    [defaults, setDefaults] = useState(false);
  const resource = useCachedRecordPage<Outfit>(
    `/admin/outfits?${new URLSearchParams({ status, category })}`,
    page,
    SIZE,
  );
  const categories = useResource<{ name: string; count: number }[]>(
    "/admin/outfits/categories",
  );
  const rows = (resource.data?.items || []) as OutfitRow[];
  // Default outfits still drawing: look again every 5 s until they are in.
  const seeding =
    (resource.data as { seeding?: number } | undefined)?.seeding || 0;
  useEffect(() => {
    if (!seeding) return;
    const timer = setTimeout(() => {
      void resource.reload();
      void categories.reload();
    }, 5000);
    return () => clearTimeout(timer);
  }, [seeding, resource.data]);
  useEffect(() => {
    if (resource.data)
      setPage((p) =>
        Math.min(p, Math.max(1, Math.ceil(resource.data!.total / SIZE))),
      );
  }, [resource.data]);
  function reload() {
    void resource.reload();
    void categories.reload();
  }
  async function action(row: OutfitRow, remove = false) {
    if (busy) return;
    if (
      remove &&
      (await ask({
        title: "删除服装？",
        message: `「${row.data.title}」删除后小程序不再展示，已生成的作品不受影响。`,
        confirmText: "删除",
        danger: true,
      })) === false
    )
      return;
    setBusy(row.id);
    try {
      await api("/admin/outfits/" + row.id, {
        method: remove ? "DELETE" : "PUT",
        confirmation: { before: row.data },
        body: JSON.stringify({
          version: row.version,
          ...(remove
            ? {}
            : { data: { ...row.data, published: !row.data.published } }),
        }),
      });
      notify(
        remove
          ? "服装已删除"
          : row.data.published
            ? "服装已下架"
            : "服装已上架",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy("");
      reload();
    }
  }
  return (
    <div className="catalog-page">
      <PageHeader page="outfits" loading={resource.loading} onRefresh={reload}>
        <button className="secondary" onClick={() => setDefaults(true)}>
          <Sparkles size={16} />
          生成默认服装
        </button>
        <button
          className="primary"
          onClick={() =>
            setEdit({ id: newId(), version: 0, createdAt: "", data: blank })
          }
        >
          <Plus size={16} />
          新增服装
        </button>
      </PageHeader>
      <div className="catalog-toolbar panel">
        <div className="business-actions">
          <Shirt size={16} />
          <span>AI试衣服装库</span>
        </div>
        <select
          aria-label="服装状态"
          value={status}
          onChange={(e) => (setStatus(e.target.value), setPage(1))}
        >
          <option value="">全部状态</option>
          <option value="published">已上架</option>
          <option value="draft">草稿 / 已下架</option>
        </select>
        <select
          aria-label="服装分类"
          value={category}
          onChange={(e) => (setCategory(e.target.value), setPage(1))}
        >
          <option value="">全部分类</option>
          {(categories.data || []).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}（{c.count}）
            </option>
          ))}
        </select>
      </div>
      <div className="catalog-caption">
        <span>
          {category || "全部分类"} ·{" "}
          {resource.data
            ? `${resource.data.total} 件服装${seeding ? `，${seeding} 件生成中` : ""}`
            : resource.loading
              ? "正在加载服装…"
              : "读取失败"}
        </span>
      </div>
      <CatalogResults
        label="服装列表"
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={reload}
      >
        <div className="studio-grid">
          {rows.map((r) => (
            <OutfitCard
              key={r.id}
              r={r}
              busy={busy}
              onEdit={() => setEdit(r)}
              onToggle={() => void action(r)}
              onDelete={() => void action(r, true)}
            />
          ))}
        </div>
        {!rows.length && !resource.loading && !resource.error && (
          <Empty
            text={category || status ? "没有匹配的服装" : "暂无服装"}
            help="上传服装图片、填写名称并上架后，小程序的 AI试衣会展示。"
          />
        )}
        <Pagination
          total={resource.data?.total || 0}
          size={SIZE}
          page={page}
          onChange={setPage}
        />
      </CatalogResults>
      {defaults && (
        <OutfitDefaults
          onClose={() => setDefaults(false)}
          onStarted={reload}
          notify={notify}
        />
      )}
      {edit && (
        <OutfitEditor
          initial={edit}
          onClose={() => setEdit(null)}
          onSaved={reload}
          notify={notify}
        />
      )}
    </div>
  );
}
