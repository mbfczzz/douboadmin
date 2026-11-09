import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { useRememberedState } from "../hooks/useRememberedState";
import LogFilters from "../logs/LogFilters";
import LogTable from "../logs/LogTable";
import PointsLog from "../logs/PointsLog";
import { logTabs, type LogTab } from "../logs/types";
import { onPreset, takePreset } from "../logs/preset";
import "../logs/logs.css";

// 日志管理: business operations, every API call, upstream model calls,
// points movements and sign-ins, each with its own filters.
export default function Logs() {
  // Opened from "我的操作日志": business tab filtered to that operator.
  const [actor, setActor] = useState(""),
    [tab, setTab] = useRememberedState<LogTab>("logs.tab", "business"),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0),
    current = logTabs.find(([id]) => id === tab) || logTabs[0];
  useEffect(() => {
    const apply = () => {
      const id = takePreset();
      if (!id) return;
      setActor(id);
      setTab("business");
      setQuery("actor=" + encodeURIComponent(id));
    };
    apply();
    return onPreset(apply);
  }, [setTab]);
  return (
    <div className="catalog-page logs-page">
      <PageHeader page="logs" onRefresh={() => setRevision((r) => r + 1)} />
      <div className="business-filters" role="tablist" aria-label="日志类型">
        {logTabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setQuery("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="quiet log-intro">{current[2]}</p>
      <LogFilters
        key={tab + actor}
        tab={tab}
        actor={tab === "business" && query.includes("actor=") ? actor : ""}
        onSearch={(q) => {
          setQuery(q);
          setRevision((r) => r + 1);
        }}
      />
      <section className="panel">
        {tab === "points" ? (
          <PointsLog key={query + revision} query={query} />
        ) : (
          <LogTable key={tab + query + revision} tab={tab} query={query} />
        )}
      </section>
    </div>
  );
}
