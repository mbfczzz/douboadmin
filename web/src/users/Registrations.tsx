import { useEffect, useRef, useState } from "react";
import type { Row } from "../api";
import Badge from "../components/Badge";
import Empty from "../components/Empty";
import FilterBar from "../components/FilterBar";
import CatalogResults from "../components/CatalogResults";
import Tag, { IdChip } from "../components/Tag";
import Table from "../business/Table";
import { codeKindName, roleName } from "../business/types";
import {
  useRegistrationDecision,
  type Registration,
} from "./useRegistrationDecision";
import { useResource } from "../hooks/useResource";
import { useCachedResource } from "../hooks/useCachedResource";
import { usePageLimit } from "../hooks/usePageLimit";
import type { Notify } from "../navigation";
import { createdCell } from "./cells";

type Page = { items: Row<Registration>[]; page: number; total: number };
const states = [
  ["pending", "待开通", "queued"],
  ["approved", "已开通", "succeeded"],
  ["rejected", "已拒绝", "failed"],
] as const;

// The platform searches all registrations; direct parents review from providers.
export default function Registrations({
  notify,
  refresh,
  path = "/admin/registrations",
  changed,
}: {
  notify: Notify;
  // Bumped by the page header's 刷新.
  refresh: number;
  path?: string;
  changed?: () => Promise<void>;
}) {
  const [status, setStatus] = useState("pending"),
    [typed, setTyped] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  // Typing settles before it queries; a new filter starts at page 1.
  useEffect(() => {
    if (typed.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, query]);
  const resource = useCachedResource<Page>(
      path +
        "?" +
        new URLSearchParams({ status, q: query, page: String(page) }),
    ),
    items = resource.data?.items || [];
  usePageLimit(page, setPage, resource.data);
  // A header refresh invalidates every status once per click; ordinary tab
  // and search changes keep the other queries' snapshots.
  const reload = resource.reload,
    previousRefresh = useRef(refresh);
  useEffect(() => {
    if (previousRefresh.current === refresh) return;
    previousRefresh.current = refresh;
    void reload();
  }, [refresh, reload]);
  const review = useRegistrationDecision(
    notify,
    async () => {
      await resource.reload();
      await changed?.();
    },
    `${path}/${status}/${query}/${page}`,
  );
  return (
    <section
      className="panel attention-panel registrations"
      aria-label="扫码登记"
    >
      <FilterBar
        inside
        options={states.map(([value, label]) => [value, label] as const)}
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        search={typed}
        onSearch={setTyped}
        placeholder="搜索姓名、手机号或用户编号"
      />
      <CatalogResults
        label="扫码登记列表"
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data &&
          (items.length ? (
            <List
              page={resource.data}
              setPage={setPage}
              decide={review.decide}
            />
          ) : (
            <Empty
              text={query ? "没有匹配的登记" : "暂无登记"}
              help={query ? "请调整搜索条件。" : "用户扫码登记后会显示在这里。"}
            />
          ))}
      </CatalogResults>
    </section>
  );
}

// Mounted only with rows, so the provider names load only when needed.
function List({
  page,
  setPage,
  decide,
}: {
  page: Page;
  setPage: (page: number) => void;
  decide: (row: Row<Registration>, approve: boolean) => Promise<void>;
}) {
  const tree = useResource<Row<{ name: string }>[]>("/admin/partners/tree"),
    names = new Map((tree.data || []).map((r) => [r.id, r.data.name]));
  const source = (r: Row<Registration>) => {
    // A scanned S1/S2 is a new provider; its source is the inviting parent.
    const id = r.data.parentId || r.data.partnerId,
      name = id === "root" ? "总账号" : names.get(id);
    return (
      <>
        {name || <IdChip>{id}</IdChip>}
        <small className="cell-note">
          {codeKindName(r.data.codeKind)}
          {r.data.referrer && (
            <>
              {" · 推荐人 "}
              <IdChip>{r.data.referrer}</IdChip>
            </>
          )}
        </small>
      </>
    );
  };
  return (
    <Table
      framed={false}
      rows={page.items}
      id={(r) => r.id}
      pagination={{ page: page.page, total: page.total, onChange: setPage }}
      columns={[
        {
          title: "用户",
          render: (r) => (
            <>
              {r.data.name || "未填写"}
              <small className="cell-note mono">
                {r.data.phone || "未填写手机号"}
              </small>
              <small className="cell-note">
                <IdChip>{r.id}</IdChip>
              </small>
            </>
          ),
        },
        {
          title: "身份",
          render: (r) => (
            <Tag tone={r.data.role === "member" ? "info" : "accent"}>
              {roleName(r.data.role)}
            </Tag>
          ),
        },
        { title: "来源", render: source },
        {
          title: "登记时间",
          render: (r) =>
            createdCell({ createdAt: r.data.registeredAt || r.createdAt }),
        },
        {
          title: "状态",
          render: (r) => {
            const [, label, tone] =
              states.find(([v]) => v === r.data.status) || states[0];
            return (
              <>
                <Badge state={tone} label={label} />
                {r.data.reason && (
                  <small className="cell-note">{r.data.reason}</small>
                )}
              </>
            );
          },
        },
        {
          title: "操作",
          action: true,
          render: (r) =>
            r.data.status === "pending" && r.data.canReview ? (
              <div className="business-actions">
                <button onClick={() => void decide(r, true)}>开通</button>
                <button
                  className="danger-text"
                  onClick={() => void decide(r, false)}
                >
                  拒绝
                </button>
              </div>
            ) : r.data.status === "pending" ? (
              "等待直属上级开通"
            ) : (
              "—"
            ),
        },
      ]}
    />
  );
}
