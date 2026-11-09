import { useState } from "react";
import { api, type Row } from "../api";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import { isProviderAccount, useMe } from "../session";
import "./signup.css";

type Signup = { openSignup: boolean };

// Whether users who verified their phone may skip the provider code.
export default function SignupSwitch({ notify }: { notify: Notify }) {
  const provider = isProviderAccount(useMe()),
    resource = useResource<Row<Signup>>("/admin/signup"),
    [busy, setBusy] = useState(false),
    row = resource.data;
  if (provider) return null;
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
            openSignup: (v) =>
              v
                ? "开放：验证手机号后可跳过激活码直接使用"
                : "关闭：验证手机号后须使用服务商激活码开通",
          },
        },
        body: JSON.stringify({ version: row.version, openSignup: !open }),
      });
      await resource.reload();
      notify(open ? "已关闭普通用户注册" : "已开放普通用户注册");
    } catch (e) {
      const message = (e as Error).message;
      if (message) {
        notify(message, "error");
        void resource.reload(); // a version conflict is retried with fresh data
      }
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
            ? "验证手机号后可跳过激活码，作为普通用户使用"
            : "验证手机号后须使用服务商激活码开通"}
        </small>
      </div>
    </div>
  );
}
