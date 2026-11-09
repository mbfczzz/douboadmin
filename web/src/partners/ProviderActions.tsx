import { Plus } from "lucide-react";
import { useMe } from "../session";
import type { PartnerTreeItem } from "./types";

export type ProviderAction =
  "edit" | "account" | "profile" | "quotas" | "codes" | "commissions";

// Row buttons of one provider: every function opens its own dialog.
// A provider login on its own node may run quotas, codes and commissions but
// its profile and login belong to its parent, so it only gets a read-only view.
export default function ProviderActions({
  item,
  canAdd,
  open,
  add,
}: {
  item: PartnerTreeItem;
  canAdd: boolean;
  open: (kind: ProviderAction, item: PartnerTreeItem) => void;
  add: (item: PartnerTreeItem) => void;
}) {
  const self = useMe()?.partnerId === item.record.id,
    button = (kind: ProviderAction, label: string, subtle = false) => (
      <button
        type="button"
        className={subtle ? "text-button subtle" : "text-button"}
        onClick={() => open(kind, item)}
      >
        {label}
      </button>
    );
  return (
    <div className="provider-tree-actions">
      <span className="provider-action-group">
        {button("quotas", "名额划拨")}
        {button("codes", "授权码")}
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
        {canAdd && (
          <button
            type="button"
            className="text-button subtle"
            onClick={() => add(item)}
          >
            <Plus size={14} aria-hidden="true" />
            新增子级
          </button>
        )}
      </span>
    </div>
  );
}
