import type { PartnerTreeItem } from "./types";
import { available } from "./types";

// One quota cell: available headline, proportional bar and a plain legend.
export default function ProviderQuota({
  pool,
}: {
  pool: PartnerTreeItem["quota"]["users"];
}) {
  const free = available(pool),
    share = (n: number) => `${Math.min(100, (n / pool.granted) * 100)}%`;
  if (!pool.granted)
    return (
      <span className="provider-quota">
        <small className="quiet">授权名额</small>
        <span className="quota-legend quiet">未分配名额</span>
      </span>
    );
  return (
    <span className="provider-quota">
      <small className="quiet">授权名额</small>
      <span className="quota-figure">
        <b>{free}</b> 可用 / 共 {pool.granted}
      </span>
      <span className="quota-bar" aria-hidden="true">
        <i className="used" style={{ width: share(pool.used) }} />
        <i className="reserved" style={{ width: share(pool.reserved) }} />
        <i className="allocated" style={{ width: share(pool.allocated) }} />
      </span>
      <span className="quota-legend quiet">
        已用 {pool.used}
        {pool.reserved ? ` · 预留 ${pool.reserved}` : ""} · 下拨{" "}
        {pool.allocated}
      </span>
    </span>
  );
}
