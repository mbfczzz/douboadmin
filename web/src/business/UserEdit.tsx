import { useState } from "react";
import { guardedClose } from "../hooks/unsaved";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import type { Notify } from "../navigation";
import type { Profile } from "./types";

// Edit the mini-program user's profile fields.
export default function UserEdit({
  user,
  onClose,
  onSaved,
  notify,
}: {
  user: Row<Profile>;
  onClose: () => void;
  onSaved: () => unknown;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  async function save(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    const data = new FormData(form);
    try {
      await api(`/admin/users/${user.id}`, {
        method: "PUT",
        confirmation: {
          before: user.data,
          title: "确认修改用户资料",
          labels: { name: "姓名", bio: "简介" },
        },
        body: JSON.stringify({
          version: user.version,
          nickname: data.get("nickname"),
          name: data.get("name"),
          phone: data.get("phone"),
          bio: data.get("bio"),
        }),
      });
      setDirty(false);
      await onSaved();
      onClose();
      notify("小程序用户资料已更新");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="form-modal"
      title="编辑用户资料"
      subtitle={user.id}
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
              昵称
              <input
                name="nickname"
                defaultValue={user.data.nickname}
                maxLength={30}
                required
              />
            </label>
            <div className="form-grid">
              <label>
                姓名
                <input
                  name="name"
                  defaultValue={user.data.name}
                  maxLength={50}
                />
              </label>
              <label>
                手机号
                <input
                  name="phone"
                  defaultValue={user.data.phone}
                  inputMode="tel"
                  pattern="\+?[0-9]{7,15}"
                  title="7–15 位数字，可带 + 号"
                  aria-describedby="user-phone-hint"
                />
                <small id="user-phone-hint" className="quiet field-hint">
                  不能清空；修改后用户需用新号码重新短信验证
                </small>
              </label>
            </div>
            <label>
              简介
              <textarea
                name="bio"
                defaultValue={user.data.bio}
                maxLength={120}
              />
            </label>
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
            保存用户资料
          </button>
        </div>
      </form>
    </Modal>
  );
}
