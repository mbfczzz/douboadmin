import { UserRound } from "lucide-react";
import { api } from "../api";
import { ask } from "../confirm/ask";
import type { Notify } from "../navigation";
import type { BoundUser } from "./CodeCard";

// The mini-program account a bind code has linked, with the way to undo it.
export default function BoundOwner({
  path,
  user,
  pending,
  reload,
  notify,
}: {
  path: string;
  user: BoundUser;
  // Scanned but not yet opened by the platform.
  pending: boolean;
  reload: () => Promise<void>;
  notify: Notify;
}) {
  const name = user.name || user.nickname || user.id;
  async function unbind() {
    const ok = await ask({
      title: "解除绑定？",
      message: pending
        ? `「${name}」的绑定登记将被关闭（记为拒绝），并生成新的绑定码。`
        : `「${name}」的小程序账号将不再是这个服务商，会生成新的绑定码。`,
      confirmText: "解除绑定",
      danger: true,
      run: () => api(path, { method: "DELETE", confirmation: false }),
    });
    if (ok === false) return;
    await reload();
    notify("已解除绑定");
  }
  return (
    <div className="bound-owner">
      <span className="bound-avatar" aria-hidden="true">
        <UserRound size={22} />
      </span>
      <div>
        <p className="bound-name">{name}</p>
        <p className="quiet">
          {pending ? "已扫码登记，等待总部开通" : "已绑定小程序账号"}
          {user.phone ? ` · ${user.phone}` : ""}
        </p>
      </div>
      <button
        type="button"
        className="text-button danger-text"
        onClick={() => void unbind()}
      >
        解除绑定
      </button>
    </div>
  );
}
