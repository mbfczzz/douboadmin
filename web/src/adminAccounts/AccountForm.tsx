import { passwordRules, PASSWORD_HINT } from "../components/password-policy";
import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import { api, APIError, type Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { AdminAccount } from "./types";
import RoleSelect from "../roles/RoleSelect";
import { useRoles } from "../roles/types";

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
  const roles = useRoles("platform");
  const [dirty, setDirty] = useState(false);
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
          confirmation: {
            before: row.data,
            title: "确认修改账号资料",
            format: { role: roles.name },
          },
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
      if (
        row &&
        error instanceof APIError &&
        error.status === 409 &&
        error.message === "数据已发生变化，请刷新后重试"
      ) {
        // Someone else changed this account: load their version into the
        // form instead of letting a second click overwrite it.
        setError("账号资料已被其他人修改，已载入最新内容，请核对后重新保存");
        await onSaved();
        setDirty(false);
      } else setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title={row ? "编辑账号资料" : "添加管理账号"}
      subtitle={row?.data.username}
      onClose={guardedClose(busy, onClose)}
    >
      <form
        // A new version (after a conflict) remounts the fields with its values.
        key={row?.version}
        className="edit-form"
        onChange={() => setDirty(true)}
        data-unsaved={dirty || busy || undefined}
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
              aria-label="手机号"
              readOnly={!!row?.data.userId}
              defaultValue={row?.data.phone}
              disabled={busy}
              inputMode="tel"
            />
            {row?.data.userId && (
              <small className="quiet">
                已关联用户，手机号在用户管理中修改。
              </small>
            )}
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
                {...passwordRules}
                required
                disabled={busy}
                autoComplete="off"
              />
              <small className="quiet">{PASSWORD_HINT}</small>
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
