import Table from "../business/Table";
import { money, type Dashboard } from "../business/types";

export default function Details({
  data,
  events = false,
}: {
  data: Dashboard;
  events?: boolean;
}) {
  return events ? (
    <Table
      rows={Object.entries(data.events || {})}
      id={(r) => r[0]}
      framed={false}
      columns={[
        { title: "事件", render: (r) => r[0] },
        { title: "次数", render: (r) => r[1] },
      ]}
    />
  ) : (
    <Table
      rows={[...data.days].reverse()}
      id={(d) => d.date}
      framed={false}
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
