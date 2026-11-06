import { useState, type FormEvent } from "react";
import { api } from "../api";
import Modal from "./Modal";
export default function ModelImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const key = new FormData(e.currentTarget).get("key");
    setBusy(true);
    setError("");
    try {
      await api("/admin/models", {
        method: "POST",
        body: JSON.stringify({ key }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="添加上游模型" onClose={() => !busy && onClose()}>
      <form className="edit-form" onSubmit={save}>
        <p>
          输入中转站模型 ID，后端会核验并导入真实参数，也可恢复此前删除的模型。
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <label>
          模型 ID
          <input
            name="key"
            disabled={busy}
            required
            maxLength={240}
            placeholder="填写上游目录中的准确 ID"
          />
        </label>
        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在核验…" : "添加模型"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
