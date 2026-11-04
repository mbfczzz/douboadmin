import { api, date, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Table from "./Table";
import RequestState from "../components/RequestState";
import { money, statuses, type Refund } from "./types";
import type { Notify } from "../navigation";

export default function RefundRecords({ notify }: { notify: Notify }) {
  const resource = useResource<Row<Refund>[]>("/admin/refunds");
  async function refresh(id: string) {
    try {
      await api(`/admin/refunds/${id}/refresh`, { method: "POST" });
      await resource.reload();
      notify("退款状态已更新");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <>
      <button className="secondary" onClick={() => void resource.reload()}>
        刷新退款记录
      </button>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          rows={resource.data}
          id={(r) => r.id}
          empty="暂无退款记录"
          columns={[
            {
              title: "退款单 / 订单",
              render: (r) => (
                <>
                  {r.id}
                  <small className="cell-note">{r.data.orderId}</small>
                </>
              ),
            },
            { title: "金额", render: (r) => money(r.data.amountFen) },
            { title: "原因", render: (r) => r.data.reason },
            {
              title: "状态",
              render: (r) => statuses[r.data.status] || r.data.status,
            },
            { title: "申请时间", render: (r) => date(r.createdAt) },
            {
              title: "操作",
              action: true,
              render: (r) => (
                <button onClick={() => void refresh(r.id)}>查询结果</button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
