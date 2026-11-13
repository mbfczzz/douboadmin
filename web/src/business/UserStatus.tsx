import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { Profile } from "./types";

// Disable or re-enable a user; the reason is kept with the change.
export default function UserStatus({
  user,
  remove = false,
  onClose,
  onSaved,
  notify,
}: {
  user: Row<Profile>;
  remove?: boolean;
  onClose: () => void;
  onSaved: () => unknown;
  notify: Notify;
}) {
  const disabling = !user.data.disabled,
    action = remove ? "删除账号" : disabling ? "停用账号" : "启用账号",
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    if (reason.trim().length < (remove ? 3 : 1)) {
      notify("请填写操作原因（删除至少3字）", "warning");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}${remove ? "" : "/status"}`, {
        method: remove ? "DELETE" : "PUT",
        confirmation: { before: user.data },
        body: JSON.stringify({
          version: user.version,
          disabled: disabling,
          reason,
        }),
      });
      await onSaved();
      onClose();
      notify(remove ? "用户已删除" : disabling ? "用户已停用" : "用户已启用");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title={action}
      subtitle={user.data.nickname || user.id}
      onClose={guardedClose(busy, onClose)}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        data-unsaved={busy || !!reason || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-body">
          <p className="quiet">
            {remove
              ? "删除后账号无法登录并从正常用户列表移除，历史订单、作品和操作记录保留。"
              : disabling
                ? "停用后该用户无法登录和使用业务功能，可随时重新启用。"
                : "启用后该用户恢复登录和使用。"}
          </p>
          <label>
            操作原因
            <textarea
              disabled={busy}
              maxLength={200}
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className={disabling ? "primary danger" : "primary"}
            disabled={busy}
          >
            {busy ? "处理中…" : action}
          </button>
        </div>
      </form>
    </Modal>
  );
}
