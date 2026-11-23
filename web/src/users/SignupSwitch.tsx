import { useState } from "react";
import { api, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import { canManageAccounts, useMe } from "../session";
import "./signup.css";

type Signup = { openSignup: boolean };

// Only the super administrator may let registered users skip provider joining.
export default function SignupSwitch({ notify }: { notify: Notify }) {
  const allowed = canManageAccounts(useMe()),
    resource = useResource<Row<Signup>>("/admin/signup"),
    [busy, setBusy] = useState(false),
    row = resource.data;
  if (!allowed) return null;
  if (!row)
    return resource.error ? (
      <button type="button" className="signup-switch" onClick={resource.reload}>
        注册开关读取失败，点击重试
      </button>
    ) : null;
  const open = row.data.openSignup;
  async function toggle() {
    if (busy || !row) return;
    setBusy(true);
    try {
      await api("/admin/signup", {
        method: "PUT",
        confirmation: {
          title: open ? "关闭普通用户注册" : "开放普通用户注册",
          before: row.data,
          format: {
            openSignup: (value) =>
              value
                ? "开放：手机号注册后可直接使用，也可通过邀请码登记"
                : "关闭：必须通过服务商邀请码登记并审核开通",
          },
        },
        body: JSON.stringify({ version: row.version, openSignup: !open }),
      });
      await resource.reload();
      notify(open ? "已关闭普通用户注册" : "已开放普通用户注册");
    } catch (error) {
      notify((error as Error).message, "error");
      void resource.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="signup-switch">
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label="开放普通用户注册"
        disabled={busy}
        className={open ? "on" : ""}
        onClick={toggle}
      >
        <span />
      </button>
      <div>
        <strong>开放普通用户注册</strong>
        <small>
          {open
            ? "手机号注册可直接使用，邀请码入口仍保留"
            : "仅允许通过邀请码登记并审核开通"}
        </small>
      </div>
    </div>
  );
}
