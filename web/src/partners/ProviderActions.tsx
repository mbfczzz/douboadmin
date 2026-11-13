import type { Row } from "../api";
import { useMe, canApproveRegistrations } from "../session";
import type { Partner } from "./types";

export type ProviderAction =
  | "delete"
  | "activity"
  | "pricing"
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
// account management belongs to the super administrator; others can only inspect it.
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
    canReject = canApprove,
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
  if (!canApprove)
    return (
      <div className="provider-tree-actions">
        {!self && button("pricing", "分佣比例")}
        {button("activity", "下级活动轨迹")}
        {button("commissions", "查看分佣")}
      </div>
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
            {button("delete", "删除", true)}
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
        {button("activity", "下级活动轨迹")}
      </span>
      <span className="provider-action-group">
        {!self && button("pricing", "分佣比例", true)}
        {!canApprove || self ? (
          button("profile", "资料", true)
        ) : (
          <>
            {button("edit", "编辑", true)}
            {button("account", "登录账号", true)}
            {button("delete", "删除", true)}
          </>
        )}
      </span>
    </div>
  );
}
