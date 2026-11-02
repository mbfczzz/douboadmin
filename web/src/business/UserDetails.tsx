import { useRef, useState } from "react";
import { api, date, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "../components/Modal";
import Table from "./Table";
import RequestState from "../components/RequestState";
import {
  points,
  ledgerLabels,
  type Ledger,
  type Profile,
  type Wallet,
} from "./types";

export default function UserDetails({
  user,
  onClose,
  onSaved,
  notify,
}: {
  user: Row<Profile>;
  onClose: () => void;
  onSaved: () => unknown;
  notify: (s: string) => void;
}) {
  const ledger = useResource<Row<Ledger>[]>(`/admin/users/${user.id}/ledger`),
    wallet = useResource<{ wallet: Wallet }>(`/admin/users/${user.id}/wallet`);
  const [amount, setAmount] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const attempt = useRef({ hash: "", key: "" });
  async function adjust() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0 || !note.trim()) {
      notify("请填写积分变动和原因");
      return;
    }
    if (busy) return;
    setBusy(true);
    const body = { units: Math.round(n * 100), note };
    const hash = JSON.stringify(body);
    if (attempt.current.hash !== hash)
      attempt.current = { hash, key: crypto.randomUUID() };
    try {
      await api(`/admin/users/${user.id}/wallet`, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: hash,
      });
      attempt.current = { hash: "", key: "" };
      setAmount("");
      await Promise.all([ledger.reload(), wallet.reload()]);
      notify("积分调整已记录");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function status() {
    if (busy) return;
    if (!note.trim()) {
      notify("请填写状态变更原因");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/status`, {
        method: "PUT",
        body: JSON.stringify({
          version: user.version,
          disabled: !user.data.disabled,
          reason: note,
        }),
      });
      await onSaved();
      onClose();
      notify("用户状态已更新");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="用户与积分" onClose={() => !busy && onClose()}>
      <div className="edit-form" aria-busy={busy}>
        <h3>{user.data.nickname}</h3>
        <p className="cell-note mono">{user.id}</p>
        <p>
          {user.data.name || "未填写姓名"} · {user.data.phone || "未填写手机号"}
        </p>
        <div className="business-metrics">
          {(
            [
              ["可用积分", "availableUnits"],
              ["预留积分", "heldUnits"],
            ] as const
          ).map(([label, key]) => (
            <div className="panel" key={key}>
              <span>{label}</span>
              <strong>
                {wallet.data ? points(wallet.data.wallet[key]) : "—"}
              </strong>
            </div>
          ))}
        </div>
        <RequestState
          error={wallet.error || ledger.error}
          retry={() => {
            void wallet.reload();
            void ledger.reload();
          }}
        />
        <label>
          积分变动（负数为扣减）
          <input
            disabled={busy}
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          操作原因
          <textarea
            disabled={busy}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="business-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void adjust()}
          >
            {busy ? "处理中…" : "确认调整积分"}
          </button>
        </div>
        <details className="overview-details">
          <summary>
            账号状态管理 · {user.data.disabled ? "已停用" : "正常"}
          </summary>
          <p className="quiet">
            填写上方操作原因后再变更状态；停用不释放授权名额。
          </p>
          <button
            className={
              user.data.disabled ? "secondary" : "secondary danger-text"
            }
            disabled={busy}
            onClick={() => void status()}
          >
            {user.data.disabled ? "启用账号" : "停用账号"}
          </button>
        </details>
        <h3 className="business-section-title">积分流水</h3>
        <Table
          rows={ledger.data || []}
          id={(r) => r.id}
          columns={[
            {
              title: "类型",
              render: (r) => ledgerLabels[r.data.kind] || r.data.kind,
            },
            { title: "可用变动", render: (r) => points(r.data.availableDelta) },
            { title: "说明", render: (r) => r.data.note },
            { title: "时间", render: (r) => date(r.createdAt) },
          ]}
        />
      </div>
    </Modal>
  );
}
