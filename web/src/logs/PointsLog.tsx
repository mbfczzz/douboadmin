import { useState } from "react";
import { date, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import Tag, { Delta, IdChip } from "../components/Tag";
import { ledgerLabels, ledgerTones, points } from "../business/types";

interface LedgerRow extends Row<{
  kind: string;
  availableDelta: number;
  heldDelta: number;
  availableAfter: number;
  heldAfter: number;
  actor?: string;
  note: string;
  reference: string;
}> {
  userName: string;
  actorName: string;
}

// Every points movement, read from the wallet ledger itself: who, how much,
// the balance after, who did it (administrator or system) and why.
export default function PointsLog({ query }: { query: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<{
    items: LedgerRow[];
    page: number;
    total: number;
    size: number;
  }>(`/admin/audit/points?page=${page}${query ? "&" + query : ""}`);
  const data = resource.data;
  return (
    <>
      <RequestState
        loading={resource.loading && !data}
        error={resource.error}
        retry={resource.reload}
      />
      {data && (
        <Table
          rows={data.items}
          id={(r) => r.id}
          empty={query ? "没有符合条件的积分变动" : "暂无积分变动"}
          pagination={{
            page: data.page,
            size: data.size,
            total: data.total,
            onChange: setPage,
          }}
          columns={[
            { title: "时间", render: (r) => date(r.createdAt, true) },
            {
              title: "用户",
              render: (r) => (
                <>
                  {r.userName || "未设置昵称"}
                  <small className="cell-note mono">{r.owner}</small>
                </>
              ),
            },
            {
              title: "类型",
              render: (r) => (
                <Tag tone={ledgerTones[r.data.kind]}>
                  {ledgerLabels[r.data.kind] || r.data.kind}
                </Tag>
              ),
            },
            {
              title: "可用 / 预留变动",
              align: "right",
              render: (r) => (
                <>
                  <Delta value={r.data.availableDelta}>
                    {points(r.data.availableDelta)}
                  </Delta>
                  <small className="cell-note">
                    预留 {points(r.data.heldDelta)}
                  </small>
                </>
              ),
            },
            {
              title: "变动后",
              align: "right",
              render: (r) => (
                <>
                  {points(r.data.availableAfter)}
                  <small className="cell-note">
                    预留 {points(r.data.heldAfter)}
                  </small>
                </>
              ),
            },
            {
              title: "操作人",
              render: (r) =>
                r.data.actor ? (
                  <>
                    <Tag tone="accent">管理员</Tag>{" "}
                    {r.actorName || r.data.actor}
                  </>
                ) : (
                  <Tag tone="warning">系统</Tag>
                ),
            },
            {
              title: "原因 / 关联",
              render: (r) => (
                <>
                  {r.data.note || "—"}
                  {r.data.reference && (
                    <small className="cell-note">
                      <IdChip>{r.data.reference}</IdChip>
                    </small>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
