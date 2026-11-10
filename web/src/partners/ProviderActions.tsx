import type { Row } from "../api";
import { useMe } from "../session";
import type { Partner } from "./types";

export type ProviderAction =
  | "edit"
  | "account"
  | "profile"
  | "share"
  | "commissions"
  | "registrations"
  | "approve"
  | "reject";

// Row buttons of one provider: every function opens its own dialog.
// A provider login on its own node may run share codes and commissions but
// its profile and login belong to its parent, so it only gets a read-only view.
export default function ProviderActions({
  item,
  open,
  busy,
}: {
  item: Row<Partner>;
  open: (kind: ProviderAction, item: Row<Partner>) => void;
  busy?: boolean;
}) {
  const me = useMe(),
    self = me?.partnerId === item.id,
    canReview = !!me && (me.partnerId || "root") === item.data.parentId,
    pending = item.data.status === "pending",
    button = (kind: ProviderAction, label: string, subtle = false) => (
      <button
        type="button"
        className={subtle ? "text-button subtle" : "text-button"}
        disabled={busy}
        onClick={() => open(kind, item)}
      >
        {label}
      </button>
    );
  if (pending)
    return (
      <div className="provider-tree-actions">
        {canReview && item.data.ownerUser ? (
          <>
            {button("approve", "开通")}
            {button("reject", "拒绝")}
          </>
        ) : (
          <span className="quiet provider-waiting">等待上级开通</span>
        )}
      </div>
    );
  return (
    <div className="provider-tree-actions">
      <span className="provider-action-group">
        {button("share", "分享码")}
        {self && button("registrations", "会员开通")}
        {button("commissions", "分佣")}
      </span>
      <span className="provider-action-group">
        {self ? (
          button("profile", "资料", true)
        ) : (
          <>
            {button("edit", "编辑", true)}
            {button("account", "登录账号", true)}
          </>
        )}
      </span>
    </div>
  );
}
