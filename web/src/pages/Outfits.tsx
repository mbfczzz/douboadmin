import { useEffect, useState } from "react";
import { Plus, Shirt, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { api, type Row, type Outfit } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useCachedRecordPage } from "../hooks/useRecordPage";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import CatalogResults from "../components/CatalogResults";
import Empty from "../components/Empty";
import Pagination from "../components/Pagination";
import OutfitEditor from "../components/OutfitEditor";
import { newId } from "../id";
import { ask } from "../confirm/ask";

type OutfitRow = Row<Outfit> & { image?: string };
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
    [busy, setBusy] = useState("");
  const resource = useCachedRecordPage<Outfit>(
    `/admin/outfits?${new URLSearchParams({ status, category })}`,
    page,
    SIZE,
  );
  const categories = useResource<{ name: string; count: number }[]>(
    "/admin/outfits/categories",
  );
  const rows = (resource.data?.items || []) as OutfitRow[];
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
            ? `${resource.data.total} 件服装`
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
            <article className="studio-card" key={r.id}>
              <div className="studio-cover">
                {r.image ? (
                  <img src={r.image} alt={r.data.title} loading="lazy" />
                ) : (
                  <Shirt size={30} />
                )}
              </div>
              <div className="studio-body">
                <div className="caption">
                  <span>{r.data.category || "未分类"}</span>
                  <span
                    className={
                      "catalog-status " + (r.data.published ? "live" : "")
                    }
                  >
                    {r.data.published ? "已上架" : "草稿"}
                  </span>
                </div>
                <h3>{r.data.title}</h3>
                <p>{r.data.description}</p>
                <small>排序 {r.data.sort}</small>
                <div className="studio-actions">
                  <button onClick={() => setEdit(r)}>
                    <Pencil size={13} />
                    编辑
                  </button>
                  <button disabled={!!busy} onClick={() => void action(r)}>
                    {r.data.published ? (
                      <EyeOff size={13} />
                    ) : (
                      <Eye size={13} />
                    )}
                    {r.data.published ? "下架" : "上架"}
                  </button>
                  <button
                    aria-label={`删除 ${r.data.title}`}
                    className="danger-text"
                    disabled={!!busy}
                    onClick={() => void action(r, true)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
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
