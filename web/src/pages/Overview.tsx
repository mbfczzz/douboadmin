import { useState } from "react";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import type { Dashboard } from "../business/types";
import Attention from "../overview/Attention";
import Headline from "../overview/Headline";
import OverviewTabs from "../overview/OverviewTabs";
import "../overview/charts.css";
import "../overview/tip.css";
import "../overview/layout.css";

// 工作概览: anything that needs attention, five headline figures with their
// change, then 经营 / 创作 / 流量 one at a time.
export default function Overview({ config, navigate }: PageProps) {
  const [days, setDays] = useState(1),
    resource = useResource<Dashboard>("/admin/dashboard?days=" + days, 30000),
    data = resource.data;
  return (
    <div className="overview-page">
      <ResourcePage
        page="overview"
        resource={resource}
        actions={
          <select
            aria-label="统计周期"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>今天</option>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        }
      >
        <Attention data={data} config={config} navigate={navigate} />
        {data && <Headline data={data} days={days} />}
        {data && <OverviewTabs data={data} days={days} navigate={navigate} />}
      </ResourcePage>
    </div>
  );
}
