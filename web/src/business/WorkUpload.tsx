import { useState } from "react";
import { api, type Job } from "../api";
import Modal from "../components/Modal";
import { guardedClose } from "../hooks/unsaved";
import type { Notify } from "../navigation";

const limit = 500 << 20;

// Upload a finished MP4 into a user's 作品; it appears in the mini-program
// like any generated video and can be shared, featured or deleted.
export default function WorkUpload({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => unknown;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  async function save(form: HTMLFormElement) {
    if (busy) return;
    const data = new FormData(form),
      file = data.get("file");
    if (!(file instanceof File) || !file.size)
      return setError("请选择视频文件");
    if (file.size > limit || file.type !== "video/mp4")
      return setError("仅支持 500 MB 以内的 MP4 视频");
    setBusy(true);
    setError("");
    try {
      await api<Job>("/admin/works", { method: "POST", body: data });
      setDirty(false);
      await onSaved();
      onClose();
      notify("作品已上传，用户在「我的作品」中即可看到");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title="为用户上传作品"
      onClose={guardedClose(busy, onClose)}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        data-unsaved={dirty || busy || undefined}
        onInput={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <div className="form-body">
          <fieldset disabled={busy}>
            <label>
              用户手机号或用户编号
              <input name="user" maxLength={64} required />
            </label>
            <label>
              作品标题
              <input name="title" maxLength={60} required />
            </label>
            <label>
              视频文件
              <input
                name="file"
                type="file"
                accept="video/mp4"
                required
                aria-describedby="work-file-hint"
              />
              <small id="work-file-hint" className="quiet field-hint">
                MP4，500 MB 以内；上传后用户可播放、保存、分享或删除
              </small>
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </fieldset>
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
            {busy ? "上传中…" : "上传作品"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
