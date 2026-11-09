import { useState, type ReactNode } from "react";
import type { Daily } from "../business/types";
import type { Traffic as Stats } from "../business/traffic";
import HBars, { type HBar } from "./HBars";
import TrafficKpis from "./TrafficKpis";
import { count, pct } from "./format";
import {
  clientNames,
  pageName,
  platformName,
  sceneName,
  sourceName,
} from "./traffic-names";
import "./traffic.css";

const clientTabs = ["all", "miniprogram", "web", "app"] as const;
type ClientTab = (typeof clientTabs)[number];

// Where visits came from: WeChat scenes for the mini-program, referrer or
// channel for web and app; "all" merges both.
function sourceRows(t: Stats, client: ClientTab): HBar[] {
  const scenes = client === "web" || client === "app" ? [] : t.scenes;
  const sources = client === "miniprogram" ? [] : t.sources || [];
  return [
    ...scenes.map((s) => ({
      key: "scene-" + s.scene,
      label: sceneName(s.scene),
      value: s.visits,
      tip: `${sceneName(s.scene)}（场景值 ${s.scene}）：${s.visits} 次访问`,
    })),
    ...sources.map((s) => ({
      key: "source-" + s.source,
      label: sourceName(s.source),
      value: s.visits,
      tip: `${sourceName(s.source)}：${s.visits} 次访问`,
    })),
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((r) => ({
      ...r,
      display: `${count(r.value)} · ${pct(r.value, t.visits)}`,
    }));
}

// Anonymous visits on every client (mini-program, web, app), switchable.
// `extra` holds further service metrics in the same section.
export default function Traffic({
  t,
  byClient,
  days,
  extra,
}: {
  t?: Stats;
  byClient?: Record<string, Stats>;
  days: Daily[];
  extra?: ReactNode;
}) {
  const [client, setClient] = useState<ClientTab>("all"),
    shown = client === "all" ? t : byClient?.[client];
  return (
    <section className="traffic-section" aria-labelledby="traffic-title">
      <div className="traffic-head">
        <h2 id="traffic-title">访问统计</h2>
        <span className="quiet">匿名访问 · 不关联账号</span>
        <div className="traffic-clients" role="tablist" aria-label="统计端">
          {clientTabs.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={client === c}
              onClick={() => setClient(c)}
            >
              {c === "all" ? "全部" : clientNames[c]}
            </button>
          ))}
        </div>
      </div>
      {!t || !shown?.visits ? (
        <p className="panel chart-empty quiet">
          {client === "all"
            ? "暂无访问数据"
            : `暂无${clientNames[client]}访问数据`}
        </p>
      ) : (
        <>
          <TrafficKpis t={shown} all={t} days={days} whole={client === "all"} />
          <div className="overview-grid three">
            <section className="panel">
              <div className="section-head">
                <h2>热门页面</h2>
                <span className="quiet">浏览量 · 访客</span>
              </div>
              <HBars
                label="热门页面"
                rows={shown.topPages.map((p) => ({
                  key: p.page,
                  label: pageName(p.page),
                  value: p.pv,
                  display: `${count(p.pv)} · ${count(p.uv)} 人`,
                  tip: `${pageName(p.page)}（${p.page}）：浏览 ${p.pv} 次，访客 ${p.uv} 人`,
                }))}
              />
            </section>
            <section className="panel">
              <div className="section-head">
                <h2>访问来源</h2>
                <span className="quiet">访问次数</span>
              </div>
              <HBars label="访问来源" rows={sourceRows(shown, client)} />
              <div className="section-head sub">
                <h3>入口页面</h3>
              </div>
              <HBars
                label="入口页面"
                rows={shown.entryPages.map((p) => ({
                  key: p.page,
                  label: pageName(p.page),
                  value: p.visits,
                  display: `${count(p.visits)} · ${pct(p.visits, shown.visits)}`,
                  tip: `${pageName(p.page)}（${p.page}）：${p.visits} 次访问由此进入`,
                }))}
              />
            </section>
            <section className="panel">
              {client === "all" && (
                <>
                  <div className="section-head">
                    <h2>各端占比</h2>
                    <span className="quiet">浏览量 · 访客</span>
                  </div>
                  <HBars
                    label="各端占比"
                    rows={(t.clients || []).map((c) => ({
                      key: c.client,
                      label: clientNames[c.client] || c.client,
                      value: c.pv,
                      display: `${count(c.pv)} · ${count(c.uv)} 人`,
                      tip: `${clientNames[c.client] || c.client}：浏览 ${c.pv} 次，占 ${pct(c.pv, t.pv)}`,
                    }))}
                  />
                </>
              )}
              <div
                className={
                  client === "all" ? "section-head sub" : "section-head"
                }
              >
                {client === "all" ? <h3>设备平台</h3> : <h2>设备平台</h2>}
                <span className="quiet">访问次数</span>
              </div>
              <HBars
                label="设备平台"
                rows={shown.platforms.map((p) => ({
                  key: p.platform,
                  label: platformName(p.platform),
                  value: p.visits,
                  display: `${count(p.visits)} · ${pct(p.visits, shown.visits)}`,
                }))}
              />
            </section>
          </div>
        </>
      )}
      {extra}
    </section>
  );
}
