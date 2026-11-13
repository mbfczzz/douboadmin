import { useState } from "react";
import { api, APIError, type Row } from "../api";
import Modal from "../components/Modal";
import type { AdminAccount } from "./types";

export default function LinkUser({
  row,
  onClose,
  onSaved,
  onReload,
}: {
  row: Row<AdminAccount>;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onReload: () => Promise<unknown>;
}) {
  const [phone, setPhone] = useState(row.data.phone || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="关联用户账号"
      subtitle={row.data.name}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="edit-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await api(`/admin/accounts/${row.id}/user`, {
              method: "PUT",
              confirmation: false,
              body: JSON.stringify({ phone, version: row.version }),
            });
            await onSaved();
            onClose();
          } catch (e) {
            setError((e as Error).message);
            if (e instanceof APIError && e.status === 409) await onReload();
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <label>
            用户手机号
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              pattern="1[0-9]{10}"
              maxLength={11}
              inputMode="tel"
              disabled={busy}
            />
          </label>
          <p className="quiet">
            已注册的手机号关联原用户；未注册的手机号创建待验证用户。积分、订单保持原归属，后台权限不变。
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
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
          <button className="primary" disabled={busy}>
            {busy ? "关联中…" : "确认关联"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
