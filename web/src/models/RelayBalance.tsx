import { RefreshCw } from "lucide-react";
import { date } from "../api";
import type { useResource } from "../hooks/useResource";
import "./relay-balance.css";

export type ManagedBalance = {
  balance: number;
  unit: "points";
  checkedAt: string;
};
const points = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 });

export default function RelayBalance({
  resource,
}: {
  resource: ReturnType<typeof useResource<ManagedBalance>>;
}) {
  const valid =
    resource.data &&
    resource.data.unit === "points" &&
    Number.isFinite(resource.data.balance) &&
    resource.data.balance >= 0;
  const error =
    resource.error ||
    (!resource.loading && resource.data && !valid
      ? "算力余额响应格式无效"
      : "");
  const title =
    error ||
    (resource.data
      ? `最近查询：${date(resource.data.checkedAt, true)}；该客户 Key 共享的可用余额，已扣除任务预扣`
      : "查询中转站 Managed 账户可用积分");
  return (
    <div
      className={`relay-balance ${error ? "has-error" : ""}`}
      title={title}
      aria-label="中转站账户余额"
    >
      <span className="relay-balance-label">算力余额</span>
      <span className="relay-balance-value" role="status">
        {resource.loading
          ? "查询中…"
          : error
            ? "查询失败"
            : valid
              ? `${points.format(resource.data!.balance)} 积分`
              : "未获取"}
      </span>
      <button
        type="button"
        className="icon"
        aria-label="刷新算力余额"
        disabled={resource.loading}
        onClick={() => void resource.reload()}
      >
        <RefreshCw size={14} className={resource.loading ? "spin" : ""} />
      </button>
    </div>
  );
}
