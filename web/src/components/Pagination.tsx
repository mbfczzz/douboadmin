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
  // Lists grow with the page (no inner scroll box), so a page change brings
  // the list's top back into view under the sticky top bar.
  const go = (next: number, from: HTMLElement) => {
    onChange(next);
    const list = from.closest<HTMLElement>(".panel, .record-table");
    const top = list?.getBoundingClientRect().top ?? 0;
    if (top < 72) window.scrollBy({ top: top - 80 });
  };
  return (
    <div className="catalog-pagination">
      <span>共 {total} 条</span>
      {pages > 1 && (
        <div>
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={(e) => go(page - 1, e.currentTarget)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            aria-label="下一页"
            disabled={page >= pages}
            onClick={(e) => go(page + 1, e.currentTarget)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
