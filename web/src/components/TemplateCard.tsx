import { Image, Pencil, Copy, Trash2, Eye, EyeOff } from "lucide-react";
import type { Row, Template, Model } from "../api";
interface Props {
  r: Row<Template>;
  modelRows: Row<Model>[];
  busy: string;
  onEdit: (r: Row<Template>) => void;
  onCopy: (t: Template) => void;
  onToggle: (r: Row<Template>) => void;
  onDelete: (r: Row<Template>) => void;
}
export default function TemplateCard({
  r,
  modelRows,
  busy,
  onEdit,
  onCopy,
  onToggle,
  onDelete,
}: Props) {
  return (
    <article className="studio-card">
      <div className="studio-cover">
        {r.data.cover ? (
          <img src={r.data.cover} alt={r.data.title} loading="lazy" />
        ) : (
          <Image size={30} />
        )}
      </div>
      <div className="studio-body">
        <div className="caption">
          <span>{r.data.category || "未分类"}</span>
          <span
            className={"catalog-status " + (r.data.published ? "live" : "")}
          >
            {r.data.published ? "已上架" : "草稿"}
          </span>
        </div>
        <h3>{r.data.title}</h3>
        <p>{r.data.description || r.data.prompt}</p>
        <div className="studio-tags">
          <span>
            {modelRows.find((m) => m.id === r.data.model)?.data.name ||
              "未配置模型"}
          </span>
          {r.data.ratio && <span>{r.data.ratio}</span>}
        </div>
        <small>
          {r.data.requiredImages} 张参考图 · 排序 {r.data.sort}
        </small>
        <div className="studio-actions">
          <button onClick={() => onEdit(r)}>
            <Pencil size={13} />
            编辑
          </button>
          <button
            title="复制为草稿"
            onClick={() =>
              onCopy({
                ...r.data,
                title: r.data.title.slice(0, 45) + " 副本",
              })
            }
          >
            <Copy size={13} />
            复制
          </button>
          <button disabled={!!busy} onClick={() => onToggle(r)}>
            {r.data.published ? <EyeOff size={13} /> : <Eye size={13} />}
            {r.data.published ? "下架" : "上架"}
          </button>
          <button
            aria-label={`删除 ${r.data.title}`}
            className="danger-text"
            disabled={!!busy}
            onClick={() => onDelete(r)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
