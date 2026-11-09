import Table from "../business/Table";
import { money, type Dashboard } from "../business/types";

export default function Details({
  data,
  events = false,
}: {
  data: Dashboard;
  events?: boolean;
}) {
  // At most 10 rows each: the newest days, the most frequent events.
  const counts = Object.entries(data.events || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (events && !counts.length)
    return <p className="chart-empty quiet">所选时段没有行为事件</p>;
  return events ? (
    <Table
      rows={counts}
      id={(r) => r[0]}
      framed={false}
      paged={false}
      columns={[
        { title: "事件", render: (r) => r[0] },
        { title: "次数", render: (r) => r[1] },
      ]}
    />
  ) : (
    <Table
      rows={[...data.days].reverse().slice(0, 10)}
      id={(d) => d.date}
      framed={false}
      paged={false}
      columns={[
        { title: "日期", render: (d) => d.date },
        {
          title: "新增 / 活跃",
          render: (d) => (
            <>
              {d.newUsers} / {d.activeUsers}
            </>
          ),
        },
        {
          title: "生成 / 成功 / 失败",
          render: (d) => (
            <>
              {d.jobs} / {d.succeeded} / {d.failed}
            </>
          ),
        },
        {
          title: "实收 / 退款",
          render: (d) => (
            <>
              {money(d.paidFen)} / {money(d.refundFen)}
            </>
          ),
        },
        { title: "净收入", render: (d) => money(d.revenueFen) },
      ]}
    />
  );
}
