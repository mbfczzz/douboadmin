import { lazy, Suspense, useState } from "react";
import PageHeader from "../components/PageHeader";
import RequestState, { LoadingState } from "../components/RequestState";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { money } from "../business/types";
import type { Overview } from "./types";
import { available, labels } from "./types";
import Picker from "./Picker";
import { canLeave } from "../hooks/unsaved";
const Providers = lazy(() => import("./Providers")),
  Quotas = lazy(() => import("./Quotas")),
  Codes = lazy(() => import("./Codes")),
  Commissions = lazy(() => import("./Commissions"));
export default function Hub({ notify }: PageProps) {
  const [id, setID] = useState("root"),
    [tab, setTab] = useState("providers"),
    [picking, setPicking] = useState(false);
  const resource = useResource<Overview>("/admin/partners/" + id, 15000),
    view = resource.data?.record.id === id ? resource.data : undefined;
  const select = (value: string) => {
    if (value !== id && !canLeave()) return;
    setID(value);
    setPicking(false);
  };
  const Current =
    {
      providers: Providers,
      quotas: Quotas,
      codes: Codes,
      commissions: Commissions,
    }[tab] || Providers;
  return (
    <div className="catalog-page partner-hub">
      <PageHeader
        page="partners"
        loading={resource.loading}
        onRefresh={resource.reload}
      />
      <div className="partner-context">
        <div>
          <h2>{view?.record.data.name || "正在读取服务商…"}</h2>
          <p>{view?.price.shares.map((s) => s.name).join(" → ")}</p>
        </div>
        <button className="secondary" onClick={() => setPicking(true)}>
          切换服务商
        </button>
      </div>
      <RequestState
        loading={resource.loading && !view}
        error={resource.error}
        retry={resource.reload}
      />
      {view && (
        <>
          <div className="business-metrics">
            {[["用户额度", view.quota.users]].map(([label, pool]) => {
              const p = pool as Overview["quota"]["users"];
              return (
                <div className="panel" key={String(label)}>
                  <span>{String(label)}</span>
                  <strong>
                    {id === "root" ? "名额源头" : available(p) + " 可用"}
                  </strong>
                  <small>
                    已使用 {p.used} · 预留 {p.reserved} · 向下划拨 {p.allocated}
                  </small>
                </div>
              );
            })}
            <div className="panel">
              <span>进价 / 子账号售价（基准算力）</span>
              <strong>
                {view.priceError
                  ? "价格待修正"
                  : money(view.price.incomingPer100Fen) +
                    " / " +
                    money(view.price.retailPer100Fen)}
              </strong>
              <small>
                {labels[view.record.data.status]} ·{" "}
                {view.price.enabled ? "分佣已启用" : "分佣规则待确认"}
              </small>
            </div>
          </div>
          {view.priceError && (
            <p role="alert" className="error">
              {view.priceError}
            </p>
          )}
          <div
            className="business-filters"
            role="tablist"
            aria-label="服务商管理模块"
          >
            {[
              ["providers", "下级服务商"],
              ["quotas", "名额划拨"],
              ["codes", "授权激活"],
              ["commissions", "算力分佣"],
            ].map(([key, label]) => (
              <button
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "primary" : "secondary"}
                key={key}
                onClick={() => {
                  if (key !== tab && canLeave()) setTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Suspense fallback={<LoadingState label="正在加载服务商模块" />}>
            <Current
              key={id + tab}
              id={id}
              view={view}
              changed={resource.reload}
              notify={notify}
              select={select}
            />
          </Suspense>
        </>
      )}
      {picking && (
        <Picker onClose={() => setPicking(false)} onChoose={select} />
      )}
    </div>
  );
}
