import type { Row } from "../api";
import type { Profile } from "./types";

export default function UserProfileForm({
  user,
  busy,
  onSave,
}: {
  user: Row<Profile>;
  busy: boolean;
  onSave: (form: HTMLFormElement) => void;
}) {
  return (
    <details className="overview-details">
      <summary>编辑小程序用户资料</summary>
      <form
        className="edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(event.currentTarget);
        }}
      >
        <label>
          昵称
          <input
            name="nickname"
            defaultValue={user.data.nickname}
            maxLength={30}
            required
            disabled={busy}
          />
        </label>
        <label>
          姓名
          <input
            name="name"
            defaultValue={user.data.name}
            maxLength={50}
            disabled={busy}
          />
        </label>
        <label>
          手机号
          <input
            name="phone"
            defaultValue={user.data.phone}
            inputMode="tel"
            disabled={busy}
          />
        </label>
        <label>
          简介
          <textarea
            name="bio"
            defaultValue={user.data.bio}
            maxLength={120}
            disabled={busy}
          />
        </label>
        <button className="primary" disabled={busy}>
          保存用户资料
        </button>
      </form>
    </details>
  );
}
