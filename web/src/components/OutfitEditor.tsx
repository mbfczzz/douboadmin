import { useState, type FormEvent } from "react";
import type { Row, Outfit } from "../api";
import { useRecordSave } from "../hooks/useRecordSave";
import Modal from "./Modal";
import CoverUpload from "./CoverUpload";
import { canLeave } from "../hooks/unsaved";
import type { Notify } from "../navigation";

// One outfit of the AI试衣 library: an uploaded picture, a short name, a
// category (春季 / 夏季 …) and a description shown under it in the gallery.
export default function OutfitEditor({
  initial,
  onClose,
  onSaved,
  notify,
}: {
  initial: Row<Outfit> & { image?: string };
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}) {
  const [data, setData] = useState(initial.data),
    [image, setImage] = useState(initial.image || ""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [dirty, setDirty] = useState(false);
  const record = useRecordSave("outfits", initial, undefined, {
    title: "试衣服装",
    labels: {
      title: "名称",
      category: "分类",
      description: "描述",
      published: "上架",
      sort: "排序",
      imageAssetId: "图片",
    },
  });
  function patch(part: Partial<Outfit>) {
    setData((d) => ({ ...d, ...part }));
    setDirty(true);
  }
  async function close() {
    if (!busy && (await canLeave())) onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    try {
      if (!(await record.save(data))) return;
      notify("服装已保存");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial.version ? "编辑服装" : "新增服装"}
      className="form-modal"
      onClose={close}
    >
      <form
        className="edit-form"
        onSubmit={save}
        data-unsaved={dirty || busy || uploading || undefined}
        aria-busy={busy || uploading}
      >
        <div className="form-body">
          <fieldset disabled={busy}>
            {record.error && (
              <div className="error" role="alert">
                {record.error}
              </div>
            )}
            <label>
              服装名称
              <input
                value={data.title}
                onChange={(e) => patch({ title: e.target.value })}
                required
                maxLength={40}
                placeholder="例如：大衣 + 针织短裙"
              />
            </label>
            <CoverUpload
              label="服装图片"
              allowUrl={false}
              value={image}
              onChange={(url, imageAssetId) => {
                setImage(url);
                patch({ imageAssetId });
              }}
              onBusy={setUploading}
            />
            <label>
              分类
              <input
                value={data.category}
                onChange={(e) => patch({ category: e.target.value })}
                maxLength={12}
                placeholder="例如：春季"
              />
            </label>
            <label>
              描述
              <textarea
                rows={3}
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
                maxLength={200}
                placeholder="款式、颜色和材质，生成时会一并参考"
              />
            </label>
            <label>
              排序
              <input
                type="number"
                min="0"
                step="1"
                value={data.sort}
                onChange={(e) => patch({ sort: Number(e.target.value) })}
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.published}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              保存后上架到小程序
            </label>
          </fieldset>
        </div>
        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="primary"
            disabled={busy || uploading || !data.imageAssetId}
          >
            {busy ? "正在保存…" : "保存服装"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
