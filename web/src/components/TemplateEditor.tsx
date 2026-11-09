import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Row, type Template, type Model } from "../api";
import { useRecordSave } from "../hooks/useRecordSave";
import Modal from "./Modal";
import TemplateOptions from "./TemplateOptions";
import { templateSummary } from "./templateSummary";
import CoverUpload from "./CoverUpload";
import { canLeave } from "../hooks/unsaved";
import { ask } from "../confirm/ask";
import type { Notify } from "../navigation";
interface Props {
  initial: Row<Template>;
  models: Row<Model>[];
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}

export default function TemplateEditor({
  initial,
  models,
  onClose,
  onSaved,
  notify,
}: Props) {
  const [data, setData] = useState(initial.data),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [dirty, setDirty] = useState(false);
  const record = useRecordSave(
      "templates",
      initial,
      undefined,
      templateSummary(models),
    ),
    error = record.error;
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function patch(part: Partial<Template>) {
    setData((d) => ({ ...d, ...part }));
    setDirty(true);
  }
  async function close() {
    if (busy) return;
    const ok = uploading
      ? (await ask({
          title: "取消封面上传？",
          message: "封面正在上传，关闭后将取消上传并放弃本次修改。",
          confirmText: "放弃修改",
          danger: true,
        })) !== false
      : await canLeave();
    if (ok) onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    try {
      if (!(await record.save(data))) return;
      notify("模板已保存");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial.version ? "编辑创作模板" : "新增创作模板"}
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
            {error && (
              <div ref={errorRef} tabIndex={-1} className="error" role="alert">
                {error}
              </div>
            )}
            <label>
              模板名称
              <input
                value={data.title}
                onChange={(e) => patch({ title: e.target.value })}
                required
                maxLength={50}
              />
            </label>
            <CoverUpload
              value={data.cover}
              onChange={(cover, coverAssetId) => patch({ cover, coverAssetId })}
              onBusy={setUploading}
            />
            <div className="form-grid">
              <label>
                分类
                <input
                  value={data.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  maxLength={40}
                  placeholder="例如：产品摄影"
                />
              </label>
              <label>
                模板栏目
                <select
                  value={data.family || "style"}
                  onChange={(e) => patch({ family: e.target.value })}
                >
                  <option value="style">风格主题</option>
                  <option value="inspiration">灵感做同款</option>
                </select>
              </label>
            </div>
            <label>
              简介
              <textarea
                rows={2}
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
                maxLength={500}
              />
            </label>
            <label>
              生成提示词
              <textarea
                rows={4}
                value={data.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                maxLength={500}
                required
              />
            </label>
            <TemplateOptions value={data} models={models} onChange={patch} />
            {data.kind === "video" && (
              <label>
                效果预览视频（可选）
                <input
                  value={data.preview || ""}
                  type="url"
                  placeholder="https://…"
                  onChange={(e) => patch({ preview: e.target.value })}
                />
              </label>
            )}
            <div className="form-grid">
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
              <label>
                必填参考图片
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="1"
                  value={data.requiredImages}
                  onChange={(e) =>
                    patch({ requiredImages: Number(e.target.value), mode: "" })
                  }
                  required
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.published}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              保存后发布到小程序
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
          <button className="primary" disabled={busy || uploading}>
            {busy ? "正在保存…" : "保存模板"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
