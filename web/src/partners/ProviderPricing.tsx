import type { Row } from "../api";
import { api } from "../api";
import type { Partner } from "./types";
import type { Notify } from "../navigation";
import { useState } from "react";
import Modal from "../components/Modal";

export default function ProviderPricing({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: Row<Partner>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="算力分佣比例"
      subtitle={row.data.name}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="edit-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const value = Number(new FormData(e.currentTarget).get("ratio"));
          if (!Number.isFinite(value) || value < 0 || value > 100) return;
          setBusy(true);
          try {
            await api(`/admin/partners/${row.id}`, {
              method: "PUT",
              body: JSON.stringify({
                version: row.version,
                data: { ...row.data, childMarginBps: Math.round(value * 100) },
              }),
              confirmation: { before: row.data },
            });
            await onSaved();
            notify("分佣比例已更新");
            onClose();
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          向下分佣比例（%）
          <input
            name="ratio"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={row.data.childMarginBps / 100}
            required
            disabled={busy}
          />
        </label>
        <p className="quiet">
          按原有层级和比例限制校验，不改变账号资料或状态。
        </p>
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
            {busy ? "保存中…" : "保存比例"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
