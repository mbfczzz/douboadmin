import type { Partner } from "./types";
import { labels } from "./types";

// Read-only profile shown when a provider login opens its own node.
export default function ProviderSelf({ partner }: { partner: Partner }) {
  return (
    <div className="edit-form">
      <div className="form-body">
        <p className="quiet">
          本服务商的名称、状态和价格由上级维护，如需调整请联系上级。
        </p>
        <dl>
          <dt>服务商名称</dt>
          <dd>{partner.name}</dd>
          <dt>状态</dt>
          <dd>{labels[partner.status] || partner.status}</dd>
          <dt>售价（每 100 元基准算力）</dt>
          <dd>{(partner.retailPer100Fen / 100).toFixed(2)} 元</dd>
          <dt>向下供货保留比例</dt>
          <dd>{(partner.childMarginBps / 100).toFixed(2)}%</dd>
        </dl>
      </div>
    </div>
  );
}
