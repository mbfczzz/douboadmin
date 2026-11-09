import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import { api } from "../api";
import Modal from "./Modal";
import PasswordInput from "./PasswordInput";
import type { Notify } from "../navigation";

// Change the signed-in account's own password.
export default function ChangePassword({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  async function save(form: HTMLFormElement) {
    const data = new FormData(form),
      current = String(data.get("current") || ""),
      next = String(data.get("next") || "");
    if (next !== data.get("repeat")) return setError("两次输入的新密码不一致");
    setBusy(true);
    setError("");
    try {
      await api("/admin/me/password", {
        method: "PUT",
        body: JSON.stringify({ current, next }),
        // This dialog is the confirmation; passwords never enter a summary.
        confirmation: false,
      });
      notify("密码已修改，其他设备需重新登录");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title="修改密码"
      onClose={guardedClose(busy, onClose)}
    >
      <form
        className="edit-form"
        onChange={() => setDirty(true)}
        data-unsaved={dirty || busy || undefined}
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <fieldset className="form-body" disabled={busy}>
          <label>
            当前密码
            <PasswordInput
              name="current"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <label>
            新密码
            <PasswordInput
              name="next"
              autoComplete="new-password"
              minLength={16}
              maxLength={128}
              required
            />
            <small className="quiet">
              至少 16 个字符，修改后其他已登录的设备需要重新登录。
            </small>
          </label>
          <label>
            再次输入新密码
            <PasswordInput
              name="repeat"
              autoComplete="new-password"
              minLength={16}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "修改密码"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
