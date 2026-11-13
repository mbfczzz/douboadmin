import type { Partner } from "./types";
import { labels } from "./types";

// Read-only profile shown when a provider login opens its own node.
export default function ProviderSelf({ partner }: { partner: Partner }) {
  return (
    <div className="edit-form">
      <div className="form-body">
        <p className="quiet">
          本服务商的名称和状态由超级管理员维护，如需调整请联系超级管理员。
        </p>
        <dl>
          <dt>服务商名称</dt>
          <dd>{partner.name}</dd>
          <dt>状态</dt>
          <dd>{labels[partner.status] || partner.status}</dd>
        </dl>
      </div>
    </div>
  );
}
