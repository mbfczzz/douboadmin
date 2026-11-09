import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import Modal from "./Modal";
import "./password-reset.css";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
// 20 characters from an unambiguous alphabet: easy to read out, hard to guess.
export function randomPassword(length = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

// Single-purpose dialog: set a new login password for one account. The
// password stays visible so it can be handed over to the account owner.
export default function PasswordReset({
  account,
  onSubmit,
  onClose,
}: {
  account: string;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(password);
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
      title="重置密码"
      subtitle={account}
      onClose={guardedClose(busy, onClose)}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        data-unsaved={busy || !!password || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-body">
          <p className="quiet">
            保存后旧密码立即失效，请把新密码告知账号使用人。
          </p>
          <div className="field">
            <label htmlFor="password-reset-input">新密码</label>
            <span className="input-with-action">
              <input
                id="password-reset-input"
                name="password"
                value={password}
                spellCheck={false}
                autoComplete="off"
                minLength={16}
                maxLength={128}
                required
                autoFocus
                disabled={busy}
                aria-describedby="password-reset-hint"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setPassword(randomPassword())}
              >
                随机生成
              </button>
            </span>
            <small id="password-reset-hint" className="quiet">
              至少 16 位
            </small>
          </div>
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
            {busy ? "保存中…" : "保存新密码"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
