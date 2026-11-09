import { useState } from "react";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { AdminAccount } from "./types";
import RoleSelect from "../roles/RoleSelect";

export default function AccountForm({
  row,
  notify,
  onClose,
  onSaved,
}: {
  row: Row<AdminAccount> | null;
  notify: Notify;
  onClose: () => void;
  onSaved: () => unknown;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(form: HTMLFormElement) {
    if (busy) return;
    setError("");
    setBusy(true);
    const data = new FormData(form),
      body = {
        name: String(data.get("name")),
        phone: String(data.get("phone")),
        role: String(data.get("role")),
      };
    try {
      if (row)
        await api(`/admin/accounts/${row.id}`, {
          method: "PUT",
          // Status has its own row action; keep it unchanged here.
          body: JSON.stringify({
            ...body,
            disabled: !!row.data.disabled,
            version: row.version,
          }),
          confirmation: { before: row.data },
        });
      else
        await api("/admin/accounts", {
          method: "POST",
          body: JSON.stringify({
            ...body,
            username: String(data.get("username")),
            password: String(data.get("password")),
          }),
        });
      await onSaved();
      onClose();
      notify(row ? "账号资料已更新" : "管理账号已创建");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title={row ? "编辑账号资料" : "添加管理账号"}
      subtitle={row?.data.username}
      onClose={() => !busy && onClose()}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <div className="form-body">
          <label>
            登录账号
            <input
              name="username"
              defaultValue={row?.data.username}
              disabled={!!row || busy}
              minLength={3}
              maxLength={32}
              required
            />
          </label>
          <label>
            姓名
            <input
              name="name"
              defaultValue={row?.data.name}
              disabled={busy}
              maxLength={50}
              required
            />
          </label>
          <label>
            手机号
            <input
              name="phone"
              defaultValue={row?.data.phone}
              disabled={busy}
              inputMode="tel"
            />
          </label>
          <label>
            角色
            <RoleSelect
              scope="platform"
              value={row?.data.role}
              disabled={busy}
            />
          </label>
          {!row && (
            <label>
              初始密码
              <input
                name="password"
                spellCheck={false}
                minLength={16}
                maxLength={128}
                required
                disabled={busy}
                autoComplete="off"
              />
            </label>
          )}
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
            {busy ? "保存中…" : row ? "保存资料" : "创建账号"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
