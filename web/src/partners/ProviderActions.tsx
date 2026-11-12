import type { Row } from "../api";
import { useMe, canApproveRegistrations } from "../session";
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
    canApprove = canApproveRegistrations(me),
    canReject =
      canApprove || (!!me && (me.partnerId || "root") === item.data.parentId),
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
        {item.data.ownerUser && (canApprove || canReject) ? (
          <>
            {canApprove ? (
              button("approve", "开通")
            ) : (
              <span className="quiet provider-waiting">等待超级管理员开通</span>
            )}
            {canReject && button("reject", "拒绝")}
          </>
        ) : (
          <span className="quiet provider-waiting">等待超级管理员开通</span>
        )}
      </div>
    );
  return (
    <div className="provider-tree-actions">
      <span className="provider-action-group">
        {button("share", "分享码")}
        {(self || canApprove) && button("registrations", "会员登记")}
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
