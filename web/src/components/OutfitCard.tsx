import { Shirt, Pencil, Trash2, Eye, EyeOff, Loader } from "lucide-react";
import type { Row, Outfit } from "../api";

export type OutfitRow = Row<Outfit> & { image?: string };

// One outfit of 试衣服装; a default outfit shows 生成中 / 生成失败 until its picture is in.
export default function OutfitCard({
  r,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  r: OutfitRow;
  busy: string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const drawing = !!r.data.seedJob;
  return (
    <article className="studio-card">
      <div className="studio-cover">
        {r.image ? (
          <img src={r.image} alt={r.data.title} loading="lazy" />
        ) : drawing ? (
          <Loader size={26} aria-label="生成中" />
        ) : (
          <Shirt size={30} />
        )}
      </div>
      <div className="studio-body">
        <div className="caption">
          <span>{r.data.category || "未分类"}</span>
          <span
            className={"catalog-status " + (r.data.published ? "live" : "")}
          >
            {drawing
              ? "生成中"
              : r.data.seedError
                ? "生成失败"
                : r.data.published
                  ? "已上架"
                  : "草稿"}
          </span>
        </div>
        <h3>{r.data.title}</h3>
        <p>
          {r.data.seedError
            ? "生成失败：" +
              r.data.seedError +
              "。可再点「生成默认服装」重试，或编辑上传图片。"
            : r.data.description}
        </p>
        <small>排序 {r.data.sort}</small>
        <div className="studio-actions">
          <button onClick={onEdit}>
            <Pencil size={13} />
            编辑
          </button>
          {r.data.imageAssetId && (
            <button disabled={!!busy} onClick={onToggle}>
              {r.data.published ? <EyeOff size={13} /> : <Eye size={13} />}
              {r.data.published ? "下架" : "上架"}
            </button>
          )}
          <button
            aria-label={`删除 ${r.data.title}`}
            className="danger-text"
            disabled={!!busy}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
