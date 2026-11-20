import { useState } from "react";
import { api, type Row, type Model } from "../api";
import { useResource } from "../hooks/useResource";
import Modal from "./Modal";
import type { Notify } from "../navigation";

// 生成默认服装: pick an image model; the server draws each default outfit
// (a flat-lay picture) and publishes it when done. Failed ones are redrawn
// by starting again; pictured or deleted ones are left alone.
export default function OutfitDefaults({
  onClose,
  onStarted,
  notify,
}: {
  onClose: () => void;
  onStarted: () => void;
  notify: Notify;
}) {
  const models = useResource<Row<Model>[]>("/admin/models");
  const images = (models.data || []).filter(
    (m) =>
      m.data.kind === "image" &&
      m.data.published &&
      m.data.available &&
      !m.data.deleted,
  );
  const [model, setModel] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const chosen = model || images[0]?.id || "";
  async function start() {
    if (busy || !chosen) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ started: number; total: number }>(
        "/admin/outfits/defaults",
        { method: "POST", body: JSON.stringify({ model: chosen }) },
      );
      notify(
        r.started
          ? `已开始生成 ${r.started} 件服装，完成后自动上架`
          : "默认服装都已生成或正在生成",
      );
      onStarted();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="生成默认服装"
      className="form-modal"
      onClose={() => !busy && onClose()}
    >
      <div className="edit-form">
        <div className="form-body">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <p className="field-hint">
            用图片模型为服装库生成春夏秋冬、礼服、运动、男装等默认服装（每件一张平铺图，不含人物）。生成完成后自动上架，可随时编辑或下架。每件按所选模型的上游价格计费，由平台承担。
          </p>
          <label>
            图片模型
            <select
              value={chosen}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy || !images.length}
            >
              {images.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.data.name}
                </option>
              ))}
            </select>
          </label>
          {!models.loading && !images.length && (
            <p className="error">
              没有已上架的图片模型，请先在模型管理中上架。
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="primary"
            onClick={() => void start()}
            disabled={busy || !chosen}
          >
            {busy ? "正在提交…" : "开始生成"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
