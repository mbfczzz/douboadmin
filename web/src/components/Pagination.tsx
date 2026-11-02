import { ChevronLeft, ChevronRight } from "lucide-react";
export default function Pagination({
  page,
  total,
  size = 20,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (!total) return null;
  return (
    <div className="catalog-pagination">
      <span>共 {total} 条</span>
      {pages > 1 && (
        <div>
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            aria-label="下一页"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
