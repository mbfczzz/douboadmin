import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { date } from "../api";
import { useCachedResource } from "../hooks/useCachedResource";
import { usePageLimit } from "../hooks/usePageLimit";
import CatalogResults from "../components/CatalogResults";
import Table from "../business/Table";
import Tag, { IdChip } from "../components/Tag";
import { codeKindName, joinMethod } from "../business/types";
import { useBusinessRoleNames } from "../roles/business";
import type { PageData } from "./types";
import type { Notify } from "../navigation";
import { useMe, canApproveRegistrations } from "../session";
import { useRegistrationDecision } from "../users/useRegistrationDecision";
import "./records.css";

type Use = {
  userId: string;
  nickname: string;
  name: string;
  phone: string;
  code: string;
  codeKind: string;
  role: string;
  method: string;
  status: string;
  reason?: string;
  registeredAt: string;
  decidedAt?: string;
};
const statuses = { pending: "待开通", approved: "已通过", rejected: "已拒绝" };

export default function CodeUses({
  id,
  kind,
  code,
  notify,
  changed,
}: {
  id: string;
  kind: string;
  code?: string;
  reviewerId: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const me = useMe(),
    canApprove = canApproveRegistrations(me),
    canReject = canApprove;
  const roleName = useBusinessRoleNames();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const key = `${id}/${kind}/${code || ""}`;
  const [paging, setPaging] = useState({ key, page: 1 });
  const page = paging.key === key ? paging.page : 1;
  const params = new URLSearchParams({
    kind,
    code: code || "",
    status,
    q: query,
    page: String(page),
  });
  const resource = useCachedResource<PageData<Use>>(
    code
      ? `/admin/partners/${encodeURIComponent(id)}/code-uses?${params}`
      : null,
    15000,
  );
  const firstPage = () => setPaging({ key, page: 1 });
  usePageLimit(page, (value) => setPaging({ key, page: value }), resource.data);
  const review = useRegistrationDecision(
    notify,
    async () => {
      await resource.reload();
      await changed();
    },
    `${key}/${status}/${query}/${page}`,
  );
  return (
    <section
      className="panel attention-panel partner-records"
      aria-label="扫码登记记录"
    >
      <div className="catalog-head actions">
        <div>
          <h2>扫码登记记录</h2>
          <p>
            {codeKindName(kind === "member" ? "" : kind)} ·
            仅显示当前码的登记记录，包含待开通用户
          </p>
        </div>
        <form
          className="records-toolbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const next = String(
              new FormData(e.currentTarget).get("q") || "",
            ).trim();
            firstPage();
            setQuery(next);
            if (next === query && page === 1) void resource.reload();
          }}
        >
          <div className="records-search">
            <span>
              <Search size={15} aria-hidden="true" />
              <input
                name="q"
                aria-label="搜索扫码记录"
                placeholder="搜索姓名、手机号、用户编号或码"
                maxLength={100}
              />
            </span>
            <button className="secondary">查询</button>
          </div>
          <div className="records-controls">
            <select
              aria-label="扫码登记状态"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                firstPage();
              }}
            >
              <option value="">全部状态</option>
              {Object.entries(statuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon"
              aria-label="刷新扫码记录"
              disabled={!code}
              onClick={() => void resource.reload()}
            >
              <RefreshCw
                size={15}
                className={resource.loading ? "spinning" : ""}
              />
            </button>
          </div>
        </form>
      </div>
      <CatalogResults
        label="扫码登记列表"
        loading={!code || (resource.loading && !resource.data)}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data && (
          <Table
            framed={false}
            rows={resource.data.items}
            id={(r) => r.id}
            empty={
              query || status ? "没有匹配的扫码登记记录" : "暂无扫码登记记录"
            }
            pagination={{
              page: resource.data.page,
              total: resource.data.total,
              onChange: (value) => setPaging({ key, page: value }),
            }}
            columns={[
              {
                title: "使用人",
                render: (r) => (
                  <>
                    <b>{r.data.name || r.data.nickname || "未填写姓名"}</b>
                    {r.data.nickname && r.data.nickname !== r.data.name && (
                      <small className="cell-note">
                        微信昵称：{r.data.nickname}
                      </small>
                    )}
                    <small className="cell-note">
                      <IdChip>{r.data.userId}</IdChip>
                    </small>
                  </>
                ),
              },
              { title: "手机号", render: (r) => r.data.phone || "未记录" },
              { title: "登记角色", render: (r) => roleName(r.data.role) },
              {
                title: "使用码",
                render: (r) => (
                  <span className="mono">
                    {r.data.code.slice(0, 4)}-{r.data.code.slice(4)}
                  </span>
                ),
              },
              {
                title: "审批状态",
                render: (r) => (
                  <>
                    <Tag
                      tone={
                        r.data.status === "approved"
                          ? "success"
                          : r.data.status === "rejected"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {statuses[r.data.status as keyof typeof statuses] ||
                        r.data.status}
                    </Tag>
                    {r.data.reason && (
                      <small className="cell-note">{r.data.reason}</small>
                    )}
                  </>
                ),
              },
              { title: "登记时间", render: (r) => date(r.data.registeredAt) },
              { title: "登记方式", render: (r) => joinMethod(r.data.method) },
              ...(canApprove || canReject
                ? [
                    {
                      title: "操作",
                      action: true,
                      render: (r: PageData<Use>["items"][number]) =>
                        r.data.status === "pending" ? (
                          <div className="business-actions">
                            {canApprove && (
                              <button
                                disabled={review.busy}
                                onClick={() =>
                                  void review.decide(r.data.userId, true, {
                                    code: r.data.code,
                                  })
                                }
                              >
                                开通
                              </button>
                            )}
                            {canReject && (
                              <button
                                className="danger-text"
                                disabled={review.busy}
                                onClick={() =>
                                  void review.decide(r.data.userId, false, {
                                    code: r.data.code,
                                  })
                                }
                              >
                                拒绝
                              </button>
                            )}
                          </div>
                        ) : (
                          "—"
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </CatalogResults>
    </section>
  );
}
