import { useEffect, useState } from "react";
import { api, type Row } from "../api";
import Badge from "../components/Badge";
import Empty from "../components/Empty";
import FilterBar from "../components/FilterBar";
import RequestState from "../components/RequestState";
import Tag, { IdChip } from "../components/Tag";
import Table from "../business/Table";
import { codeKindName, roleName } from "../business/types";
import { ask } from "../confirm/ask";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import { createdCell } from "./cells";

// A scan registration (record id = mini-program user id).
type Registration = {
  role: string;
  partnerId: string;
  parentId?: string;
  referrer?: string;
  codeKind: string;
  code: string;
  method: string;
  name: string;
  phone: string;
  status: string;
  reason?: string;
  // The latest scan; a rejected user may register again.
  registeredAt?: string;
};
type Page = { items: Row<Registration>[]; page: number; total: number };
const states = [
  ["pending", "待开通", "queued"],
  ["approved", "已开通", "succeeded"],
  ["rejected", "已拒绝", "failed"],
] as const;

// 扫码登记: every scan waits here until the platform opens or rejects it.
export default function Registrations({
  notify,
  refresh,
}: {
  notify: Notify;
  // Bumped by the page header's 刷新.
  refresh: number;
}) {
  const [status, setStatus] = useState("pending"),
    [typed, setTyped] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  // Typing settles before it queries; a new filter starts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed]);
  const resource = useResource<Page>(
      "/admin/registrations?" +
        new URLSearchParams({ status, q: query, page: String(page) }),
    ),
    items = resource.data?.items || [];
  // The header's 刷新 reloads this list (skipping the first render).
  const reload = resource.reload;
  useEffect(() => {
    if (refresh) void reload();
  }, [refresh, reload]);
  async function decide(row: Row<Registration>, approve: boolean) {
    const who = row.data.name || row.id,
      role = roleName(row.data.role);
    const ok = await ask({
      title: approve ? "开通登记" : "拒绝登记",
      message: approve
        ? `「${who}」将以${role}身份开通，开通后即可使用。`
        : `拒绝「${who}」的${role}登记，用户可重新扫码登记。`,
      confirmText: approve ? "开通" : "拒绝",
      danger: !approve,
      reason: approve
        ? undefined
        : { label: "拒绝原因", minLength: 2, maxLength: 200 },
      run: (reason) =>
        api(`/admin/registrations/${encodeURIComponent(row.id)}`, {
          method: "PUT",
          confirmation: false,
          body: JSON.stringify({ approve, reason, version: row.version }),
        }),
    });
    if (ok === false) return;
    notify(approve ? `${who} 已开通` : `已拒绝 ${who} 的登记`);
    await resource.reload();
  }
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
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data &&
        (items.length ? (
          <List page={resource.data} setPage={setPage} decide={decide} />
        ) : (
          <Empty
            text={query ? "没有匹配的登记" : "暂无登记"}
            help={query ? "请调整搜索条件。" : "用户扫码登记后会显示在这里。"}
          />
        ))}
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
            r.data.status === "pending" ? (
              <div className="business-actions">
                <button onClick={() => void decide(r, true)}>开通</button>
                <button
                  className="danger-text"
                  onClick={() => void decide(r, false)}
                >
                  拒绝
                </button>
              </div>
            ) : (
              "—"
            ),
        },
      ]}
    />
  );
}
