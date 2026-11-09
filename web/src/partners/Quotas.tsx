import { useState } from "react";
import { date } from "../api";
import Records, { useRecords } from "./Records";
import QuotaForm from "./QuotaForm";
import QuotaRequests from "./QuotaRequests";
import type { Move, Scope } from "./types";
import { available, kindTones, labels } from "./types";
import TabSummary from "./TabSummary";
import Tag from "../components/Tag";
import { PartnerIdentity } from "./PartnerIdentity";
export default function Quotas({ id, view, changed, notify }: Scope) {
  const resource = useRecords<Move>("/admin/quota-moves?around=" + id),
    pool = view.quota.users,
    share = (n: number) =>
      `${pool.granted ? Math.min(100, (n / pool.granted) * 100) : 0}%`,
    [form, setForm] = useState<"grant" | "reclaim" | "request" | null>(null),
    [revision, setRevision] = useState(0);
  return (
    <>
      <TabSummary
        stats={[
          {
            label: "可用名额",
            value: available(pool),
            note: `/ 共 ${pool.granted}`,
            tone: "accent",
          },
          { label: "已使用", value: pool.used, dot: "used" },
          { label: "激活码预留", value: pool.reserved, dot: "reserved" },
          { label: "已下拨给下级", value: pool.allocated, dot: "allocated" },
        ]}
        actions={
          <>
            <button
              type="button"
              className="primary"
              onClick={() => setForm("grant")}
            >
              划拨名额
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setForm("reclaim")}
            >
              收回名额
            </button>
            <button
              type="button"
              className="secondary"
              disabled={id === "root"}
              onClick={() => setForm("request")}
            >
              向上级申请
            </button>
          </>
        }
      >
        <span className="quota-bar" aria-hidden="true">
          <i className="used" style={{ width: share(pool.used) }} />
          <i className="reserved" style={{ width: share(pool.reserved) }} />
          <i className="allocated" style={{ width: share(pool.allocated) }} />
        </span>
      </TabSummary>
      <Records
        title="名额划拨记录"
        description="本服务商收到的名额，以及划拨给直接下级或从下级收回的名额。"
        resource={resource}
        columns={[
          {
            title: "上级服务商",
            render: (r) => <PartnerIdentity id={r.data.parentId} />,
          },
          {
            title: "下级服务商",
            render: (r) => <PartnerIdentity id={r.data.childId} />,
          },
          {
            title: "类型",
            render: (r) => (
              <Tag tone={kindTones[r.data.kind]}>{labels[r.data.kind]}</Tag>
            ),
          },
          {
            title: "用户额度",
            render: (r) => <span className="amount">{r.data.users}</span>,
          },
          { title: "说明", render: (r) => r.data.reason },
          { title: "时间", render: (r) => date(r.createdAt) },
        ]}
      />
      <QuotaRequests
        key={revision}
        id={id}
        notify={notify}
        changed={async () => {
          await resource.reload();
          await changed();
        }}
      />
      {form && (
        <QuotaForm
          view={view}
          mode={form}
          notify={notify}
          onClose={() => setForm(null)}
          onSaved={async () => {
            await resource.reload();
            await changed();
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
