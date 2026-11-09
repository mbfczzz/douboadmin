import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  framed = true,
  paged = true,
}: {
  rows: T[];
  columns: Column<T>[];
  id: (row: T) => string;
  empty?: string;
  help?: string;
  framed?: boolean;
  // false: show every row given and no page bar (the caller pages itself,
  // e.g. with cursors).
  paged?: boolean;
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
    visible =
      pagination || !paged
        ? rows
        : rows.slice((current - 1) * 20, current * 20);
  useEffect(() => {
    const media = matchMedia("(max-width: 640px)"),
      update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // A table wider than its panel would slide under the pinned action column,
  // so it switches to cards until the panel is wide enough again.
  const box = useRef<HTMLElement>(null),
    need = useRef(0),
    [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || mobile) return;
    const check = () => {
      const scroll = el.querySelector<HTMLElement>(":scope > .table-scroll");
      if (scroll && scroll.scrollWidth > scroll.clientWidth + 1) {
        need.current = scroll.scrollWidth;
        setNarrow(true);
      } else if (!scroll && el.clientWidth >= need.current) setNarrow(false);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobile, narrow, visible]);
  const cards = mobile || narrow;
  return (
    <section
      ref={box}
      className={framed ? "panel record-table" : "record-table"}
    >
      {!cards && (
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
      {cards && (
        <div
          className={"mobile-records" + (mobile ? "" : " wide")}
          key={"mobile-" + current}
        >
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
      {paged && (
        <Pagination
          total={pagination?.total ?? rows.length}
          page={current}
          onChange={pagination?.onChange ?? setPage}
        />
      )}
    </section>
  );
}
