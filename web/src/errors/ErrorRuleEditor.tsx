import { useState, type FormEvent } from "react";
import { api, type Row } from "../api";
import { useRecordSave } from "../hooks/useRecordSave";
import Modal from "../components/Modal";
import { canLeave } from "../hooks/unsaved";
import type { Notify } from "../navigation";
import type { ErrorRule } from "./types";

const labels = {
  contains: "匹配内容",
  message: "用户看到的提示",
  action: "建议操作",
};

// Files a failure: users whose failure text contains the fragment read the
// message (and action) instead of 系统异常; never the upstream text.
export default function ErrorRuleEditor({
  initial,
  cause,
  onClose,
  onSaved,
  notify,
}: {
  initial: Row<ErrorRule>;
  cause?: string; // the upstream text this rule is filed from
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}) {
  const [data, setData] = useState(initial.data),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const record = useRecordSave("error-rules", initial, undefined, {
    title: "错误归档",
    labels,
  });
  const matches =
    !cause || cause.toLowerCase().includes(data.contains.trim().toLowerCase());
  function patch(part: Partial<ErrorRule>) {
    setData((d) => ({ ...d, ...part }));
    setDirty(true);
  }
  async function close() {
    if (!busy && (await canLeave())) onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (initial.version) {
        if (!(await record.save(data))) return;
      } else {
        await api("/admin/error-rules", {
          method: "POST",
          body: JSON.stringify({ data }),
        });
      }
      notify("错误归档已保存，用户将看到新的提示");
      onSaved();
      onClose();
    } catch (e) {
      if ((e as Error).message) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial.version ? "编辑错误归档" : "归档此错误"}
      className="form-modal"
      onClose={close}
    >
      <form
        className="edit-form"
        onSubmit={save}
        data-unsaved={dirty || busy || undefined}
        aria-busy={busy}
      >
        <div className="form-body">
          <fieldset disabled={busy}>
            {(record.error || error) && (
              <div className="error" role="alert">
                {record.error || error}
              </div>
            )}
            {cause && (
              <p className="field-hint">上游原文（仅管理员可见）：{cause}</p>
            )}
            <label>
              {labels.contains}
              <input
                value={data.contains}
                onChange={(e) => patch({ contains: e.target.value })}
                required
                minLength={2}
                maxLength={200}
                placeholder="例如：素材时长"
              />
            </label>
            <p className="field-hint">
              失败原文包含这段文字时生效（不区分大小写，所有模型通用）。只保留不会变化的关键词，去掉秒数、编号等每次不同的内容。
            </p>
            {!matches && (
              <p className="error" role="alert">
                上面的上游原文不包含这段文字，保存后对这条任务不起作用。
              </p>
            )}
            <label>
              {labels.message}
              <input
                value={data.message}
                onChange={(e) => patch({ message: e.target.value })}
                required
                minLength={2}
                maxLength={60}
                placeholder="例如：参考视频时长超出模型限制"
              />
            </label>
            <label>
              {labels.action}（可选）
              <input
                value={data.action || ""}
                onChange={(e) => patch({ action: e.target.value })}
                maxLength={100}
                placeholder="例如：请把参考视频剪短到 30 秒以内后重试。"
              />
            </label>
            <p className="field-hint">
              用户只会看到这里填写的提示和建议，看不到上游原文、错误码或渠道信息。
            </p>
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
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存归档"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
