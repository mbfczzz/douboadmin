import { BarChart3, Globe, Sparkles } from "lucide-react";
import type { Dashboard } from "../business/types";
import type { PageId } from "../navigation";
import { useRememberedState } from "../hooks/useRememberedState";
import Empty from "../components/Empty";
import Trend from "./Trend";
import Business from "./Business";
import Traffic from "./Traffic";
import ModelCost from "./ModelCost";
import DetailList from "./DetailList";
import { HoursPanel, KindPanel } from "./Generation";

const tabs = [
  ["business", "经营", BarChart3],
  ["creation", "创作", Sparkles],
  ["traffic", "流量", Globe],
] as const;
type Tab = (typeof tabs)[number][0];

// Below the headline: one topic at a time, each with its own trend chart.
// A tab with no data at all shows one hint instead of a page of empty charts.
export default function OverviewTabs({
  data,
  days,
  navigate,
}: {
  data: Dashboard;
  days: number;
  navigate: (page: PageId) => void;
}) {
  const [tab, setTab] = useRememberedState<Tab>("overview.tab", "business"),
    b = data.breakdown,
    today = days === 1,
    hours = today ? data.hours : undefined,
    sum = (pick: (d: Dashboard["days"][number]) => number) =>
      data.days.reduce((a, d) => a + (pick(d) || 0), 0);
  const content = () => {
    if (tab === "business") {
      const has =
        sum((d) => d.paidFen + d.newUsers) > 0 ||
        !!(
          b &&
          (b.activeUsers ||
            b.ordersCreated ||
            b.memberActivations ||
            b.ownerActivations)
        );
      if (!b || !has)
        return (
          <Empty
            text="所选时段暂无经营数据"
            help="有用户注册、开通或充值后，这里会显示收入趋势、用户转化和开通情况。"
          />
        );
      return (
        <>
          <Trend
            series={data.days}
            hours={hours}
            only={["paid", "orders", "new", "active"]}
          />
          <Business b={b} today={today} />
          <DetailList
            title={
              today
                ? "今日经营数据"
                : `每日经营数据 · 最近 ${Math.min(days, 10)} 天`
            }
            data={data}
          />
        </>
      );
    }
    if (tab === "creation") {
      if (!b || (!sum((d) => d.jobs) && !data.models.length))
        return (
          <Empty
            text="所选时段还没有生成任务"
            help="用户在小程序发起图片或视频生成后，这里会显示生成趋势、类型分布和模型成本。"
          />
        );
      const cost = <ModelCost models={data.models} navigate={navigate} />;
      return (
        <>
          <Trend series={data.days} hours={hours} only={["jobs", "spent"]} />
          <div className="overview-grid">
            <KindPanel b={b} />
            {/* Today's trend is already hourly; weekdays need a longer period. */}
            {today ? cost : <HoursPanel b={b} weekdays={days > 7} />}
          </div>
          {!today && cost}
        </>
      );
    }
    const t = b?.traffic;
    if (
      !t?.visits &&
      !sum((d) => d.pv || 0) &&
      !Object.keys(data.events || {}).length
    )
      return (
        <Empty
          text="所选时段暂无访问数据"
          help="小程序、网页或 APP 有访问后，这里会显示浏览量、访客、来源和热门页面。"
        />
      );
    return (
      <>
        <Trend series={data.days} hours={hours} only={["uv", "pv"]} />
        <Traffic t={t} byClient={b?.trafficByClient} days={data.days} />
        <DetailList title="行为事件 · 前 10 项" data={data} events />
      </>
    );
  };
  return (
    <>
      <div className="overview-tabs" role="tablist" aria-label="概览分类">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div className="overview-tab" role="tabpanel">
        {content()}
      </div>
    </>
  );
}
