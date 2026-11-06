import { useState } from "react";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { AdminAccount } from "./types";

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
      password = String(data.get("password") || ""),
      body = {
        username: String(data.get("username")),
        name: String(data.get("name")),
        phone: String(data.get("phone")),
        role: String(data.get("role")),
        disabled: !!data.get("disabled"),
      };
    try {
      let saved: Row<AdminAccount>;
      if (row) {
        saved = await api(`/admin/accounts/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...body, version: row.version }),
        });
        if (password)
          await api(`/admin/accounts/${row.id}/password`, {
            method: "PUT",
            body: JSON.stringify({ version: saved.version, password }),
          });
      } else
        saved = await api("/admin/accounts", {
          method: "POST",
          body: JSON.stringify({ ...body, password }),
        });
      await onSaved();
      onClose();
      notify(row ? "管理账号已更新" : "管理账号已创建");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!row || !confirm("归档后该账号将无法登录，确认继续吗？")) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/accounts/${row.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: row.version }),
      });
      await onSaved();
      onClose();
      notify("管理账号已归档");
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={row ? "编辑管理账号" : "添加管理账号"}
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
          <select
            name="role"
            defaultValue={row?.data.role || "operator"}
            disabled={busy}
          >
            <option value="operator">平台运营</option>
            <option value="super_admin">超级管理员</option>
          </select>
        </label>
        <label>
          {row ? "重置密码（不修改请留空）" : "初始密码"}
          <input
            name="password"
            type="password"
            minLength={16}
            maxLength={128}
            required={!row}
            disabled={busy}
            autoComplete="new-password"
          />
        </label>
        {row && (
          <label className="checkbox">
            <input
              name="disabled"
              type="checkbox"
              defaultChecked={row.data.disabled}
              disabled={busy}
            />{" "}
            停用账号
          </label>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存账号"}
          </button>
          {row && (
            <button
              type="button"
              className="secondary danger-text"
              disabled={busy}
              onClick={() => void archive()}
            >
              归档账号
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
