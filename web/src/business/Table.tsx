import { useEffect, useState, type ReactNode } from "react";
import Pagination from "../components/Pagination";
import Empty from "../components/Empty";
export interface Column<T> {
  title: string;
  action?: boolean;
  render: (row: T) => ReactNode;
}
export default function Table<T>({
  rows,
  columns,
  id,
  empty = "暂无记录",
  help = "",
  pagination,
}: {
  rows: T[];
  columns: Column<T>[];
  id: (row: T) => string;
  empty?: string;
  help?: string;
  pagination?: {
    page: number;
    total: number;
    onChange: (page: number) => void;
  };
}) {
  const [page, setPage] = useState(1),
    [mobile, setMobile] = useState(
      () => matchMedia("(max-width: 640px)").matches,
    ),
    current =
      pagination?.page ??
      Math.min(page, Math.max(1, Math.ceil(rows.length / 20))),
    visible = pagination ? rows : rows.slice((current - 1) * 20, current * 20);
  useEffect(() => {
    const media = matchMedia("(max-width: 640px)"),
      update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <section className="panel record-table">
      {!mobile && (
        <div className="table-scroll" key={current}>
          <table className="catalog-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.title}
                    className={c.action ? "table-actions" : undefined}
                  >
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={id(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.title}
                      className={c.action ? "table-actions" : undefined}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mobile && (
        <div className="mobile-records" key={"mobile-" + current}>
          {visible.map((row) => (
            <article className="mobile-record" key={id(row)}>
              <dl>
                {columns
                  .filter((column) => !column.action)
                  .map((column) => (
                    <div key={column.title}>
                      <dt>{column.title}</dt>
                      <dd>{column.render(row)}</dd>
                    </div>
                  ))}
              </dl>
              {columns
                .filter((column) => column.action)
                .map((column) => (
                  <div className="mobile-record-actions" key={column.title}>
                    {column.render(row)}
                  </div>
                ))}
            </article>
          ))}
        </div>
      )}
      {!rows.length && <Empty text={empty} help={help} />}
      <Pagination
        total={pagination?.total ?? rows.length}
        page={current}
        onChange={pagination?.onChange ?? setPage}
      />
    </section>
  );
}
