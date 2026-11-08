import { lazy, Suspense } from "react";
import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRememberedState } from "../hooks/useRememberedState";
import PageHeader from "../components/PageHeader";
import RequestState, { LoadingState } from "../components/RequestState";
import type { Platform } from "../business/types";
import RefundRecords from "../business/RefundRecords";
const PaymentRecords = lazy(() => import("../business/PaymentRecords"));
const VirtualEvents = lazy(() => import("../business/VirtualEvents"));

export default function Payments({ notify, navigate }: PageProps) {
  const [tab, setTab] = useRememberedState("payments.tab", "payments");
  const settings = useResource<{
    record: Row<Platform>;
    capabilities: { payment: boolean };
  }>("/admin/platform");
  return (
    <div className="catalog-page payments-page">
      <PageHeader page="payments">
        <button className="secondary" onClick={() => navigate("settings")}>
          充值与积分设置
        </button>
      </PageHeader>
      <RequestState error={settings.error} retry={settings.reload} />
      <div
        className={
          settings.loading || settings.data?.capabilities.payment
            ? "notice"
            : "notice warning"
        }
      >
        <div>
          <b>
            {settings.loading
              ? "正在读取支付配置…"
              : settings.error
                ? "支付配置读取失败"
                : settings.data?.capabilities.payment
                  ? "微信支付已配置"
                  : "微信支付待配置"}
          </b>
          <p>
            支付成功以服务端验签通知或查单为准。虚拟支付异常可在异常处理页核对。
          </p>
        </div>
      </div>
      <div
        className="business-filters"
        role="tablist"
        aria-label="支付记录类型"
      >
        {[
          ["payments", "支付记录"],
          ["refunds", "退款记录"],
          ["events", "虚拟支付异常"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "primary" : "secondary"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Suspense fallback={<LoadingState label="正在加载支付记录" />}>
        {tab === "payments" ? (
          <PaymentRecords />
        ) : tab === "events" ? (
          <VirtualEvents notify={notify} />
        ) : (
          <RefundRecords notify={notify} />
        )}
      </Suspense>
    </div>
  );
}
