import { useState } from "react";
import type { Row } from "../api";
import Modal from "../components/Modal";
import RoleSelect from "../roles/RoleSelect";
import type { AdminAccount } from "../adminAccounts/types";
import { createAccount, saveAccount } from "./accountActions";

// Shared submit wrapper: busy state and inline error for the small forms.
function useSubmit(
  run: (data: FormData) => Promise<unknown>,
  onFailed?: () => void,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (form: HTMLFormElement) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await run(new FormData(form));
      return true;
    } catch (e) {
      setError((e as Error).message);
      onFailed?.();
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

const FormError = ({ text }: { text: string }) =>
  text ? (
    <div className="error" role="alert">
      {text}
    </div>
  ) : null;

// First login for a provider that has none yet.
export function AccountCreate({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { busy, error, submit } = useSubmit((data) =>
    createAccount(id, {
      username: String(data.get("username") || "").trim(),
      password: String(data.get("password") || ""),
      role: String(data.get("role") || "partner"),
    }),
  );
  return (
    <form
      className="edit-form"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await submit(e.currentTarget)) await onSaved();
      }}
    >
      <div className="form-body">
        <fieldset disabled={busy}>
          <p className="quiet">该服务商还没有登录账号，开通后即可登录后台。</p>
          <label>
            账号
            <input
              name="username"
              pattern="[A-Za-z0-9._-]{3,32}"
              autoComplete="off"
              required
            />
          </label>
          <label>
            初始密码
            <input
              name="password"
              spellCheck={false}
              autoComplete="off"
              minLength={16}
              maxLength={128}
              required
            />
          </label>
          <label>
            角色
            <RoleSelect scope="partner" />
          </label>
          <FormError text={error} />
        </fieldset>
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onClose}>
          取消
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "开通中…" : "开通账号"}
        </button>
      </div>
    </form>
  );
}

// Change only the role of an existing provider login.
export function RoleChange({
  partnerId,
  account,
  onClose,
  onSaved,
  onFailed,
}: {
  partnerId: string;
  account: Row<AdminAccount>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onFailed: () => void;
}) {
  const { busy, error, submit } = useSubmit(
    (data) =>
      saveAccount(partnerId, account, { role: String(data.get("role")) }),
    onFailed,
  );
  return (
    <Modal
      className="form-modal"
      title="修改角色"
      subtitle={account.data.username}
      onClose={() => !busy && onClose()}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!(await submit(e.currentTarget))) return;
          await onSaved();
          onClose();
        }}
      >
        <div className="form-body">
          <fieldset disabled={busy}>
            <label>
              角色
              <RoleSelect scope="partner" value={account.data.role} />
            </label>
            <p className="quiet">角色决定该服务商登录后可见的菜单。</p>
            <FormError text={error} />
          </fieldset>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存角色"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
