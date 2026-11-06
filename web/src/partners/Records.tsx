import { useState } from "react";
import type { Row } from "../api";
import type { Column } from "../business/Table";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { PageData } from "./types";
import type { ReactNode } from "react";

export function useRecords<T>(path: string, pollMs = 0) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const resource = useResource<PageData<T>>(
    path +
      (path.includes("?") ? "&" : "?") +
      new URLSearchParams({ page: String(page), q: query }),
    pollMs,
  );
  return {
    ...resource,
    setPage,
    query,
    search: (value: string) => {
      if (page === 1 && query === value) {
        void resource.reload();
        return;
      }
      setPage(1);
      setQuery(value);
    },
  };
}
export default function Records<T>({
  resource,
  columns,
  actions,
  title,
  description,
  controls,
  footnote,
  empty = "暂无记录",
}: {
  resource: ReturnType<typeof useRecords<T>>;
  columns: Column<Row<T>>[];
  actions?: ReactNode;
  title?: string;
  description?: ReactNode;
  controls?: ReactNode;
  footnote?: ReactNode;
  empty?: string;
}) {
  return (
    <section
      className={title ? "panel attention-panel partner-records" : undefined}
      aria-label={title}
    >
      <div className={title ? "catalog-head actions" : undefined}>
        {title && (
          <>
            <div>
              <h2>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <div className="actions">{actions}</div>
          </>
        )}
        <form
          className="business-filters"
          onSubmit={(e) => {
            e.preventDefault();
            resource.search(
              String(new FormData(e.currentTarget).get("q") || ""),
            );
          }}
        >
          <input
            name="q"
            aria-label="查询记录"
            placeholder="输入名称、编号或备注"
            maxLength={100}
          />
          <button className="secondary">查询</button>
          <button
            type="button"
            className="secondary"
            onClick={() => void resource.reload()}
          >
            刷新
          </button>
          {!title && actions}
          {controls}
        </form>
      </div>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          framed={!title}
          rows={resource.data.items}
          id={(r) => r.id}
          columns={columns}
          empty={empty}
          pagination={{
            page: resource.data.page,
            total: resource.data.total,
            onChange: resource.setPage,
          }}
        />
      )}
      {footnote && <div className="catalog-head quiet">{footnote}</div>}
    </section>
  );
}
