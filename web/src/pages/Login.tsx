import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { api } from "../api";
export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: f.get("username"),
          password: f.get("password"),
        }),
      });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="login">
      <form onSubmit={login} className="login-form">
        <div className="brand">
          <span>豆</span>豆播 AI
        </div>
        <h1>登录管理后台</h1>
        <p>使用管理员账号登录，管理模型、模板与用户。</p>
        <label>
          管理员账号
          <input
            name="username"
            autoComplete="username"
            defaultValue="admin"
            required
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <button className="primary" disabled={saving}>
          {saving ? "正在登录…" : "登录管理台"}
          <ArrowUpRight size={18} />
        </button>
      </form>
    </div>
  );
}
