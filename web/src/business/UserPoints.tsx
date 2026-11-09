import { useRef, useState } from "react";
import { api, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import { newId } from "../id";
import { points, type Profile, type Wallet } from "./types";
import "./user-activation.css";

// Focused points adjustment: current balance, change and the reason.
export default function UserPoints({
  user,
  onClose,
  notify,
}: {
  user: Row<Profile>;
  onClose: () => void;
  notify: Notify;
}) {
  const wallet = useResource<{ wallet: Wallet }>(
      `/admin/users/${user.id}/wallet`,
    ),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    attempt = useRef({ hash: "", key: "" }),
    balance = wallet.data?.wallet.availableUnits;
  async function adjust() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) {
      notify("请填写非 0 的积分变动", "warning");
      return;
    }
    if (note.trim().length < 3) {
      notify("操作原因至少 3 个字", "warning");
      return;
    }
    if (busy) return;
    setBusy(true);
    const body = JSON.stringify({ units: Math.round(n * 100), note });
    // The same request keeps its key so a retry cannot double-apply.
    if (attempt.current.hash !== body)
      attempt.current = { hash: body, key: newId() };
    try {
      await api(`/admin/users/${user.id}/wallet`, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body,
      });
      notify("积分调整已记录");
      onClose();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const after =
    balance !== undefined && Number.isFinite(Number(amount)) && amount
      ? balance + Math.round(Number(amount) * 100)
      : undefined;
  return (
    <Modal
      className="form-modal"
      title="调整积分"
      subtitle={user.data.nickname || user.id}
      onClose={() => !busy && onClose()}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        data-unsaved={busy || !!amount || !!note || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void adjust();
        }}
      >
        <div className="form-body">
          <dl className="points-preview">
            <div>
              <dt>当前可用</dt>
              <dd>{balance === undefined ? "—" : points(balance)}</dd>
            </div>
            <div>
              <dt>调整后</dt>
              <dd
                className={
                  after !== undefined && after < 0 ? "danger-text" : ""
                }
              >
                {after === undefined ? "—" : points(after)}
              </dd>
            </div>
          </dl>
          <label>
            积分变动（负数为扣减）
            <input
              disabled={busy}
              type="number"
              step="0.01"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            操作原因
            <textarea
              disabled={busy}
              maxLength={200}
              value={note}
              placeholder="例如：活动补偿、人工退回"
              onChange={(e) => setNote(e.target.value)}
              aria-describedby="points-note-hint"
            />
          </label>
          <small id="points-note-hint" className="quiet field-hint">
            至少 3 个字
          </small>
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
            {busy ? "处理中…" : "确认调整积分"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
