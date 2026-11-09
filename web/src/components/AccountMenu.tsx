import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import type { Me } from "../session";
import type { Notify } from "../navigation";
import ChangePassword from "./ChangePassword";
import "./account-menu.css";

// Signed-in account: who you are, change your password, sign out.
export default function AccountMenu({
  me,
  notify,
  onLogout,
}: {
  me: Me;
  notify: Notify;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(false),
    box = useRef<HTMLDivElement>(null),
    name = me.name || me.account || "管理员";
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="account-menu" ref={box}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`账号菜单：${name}`}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{name[0]}</span>
        <b>{name}</b>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-popover" role="menu">
          <div className="account-who">
            <b>{name}</b>
            <small>
              {me.account} · {me.partnerName || me.roleName || "管理员"}
            </small>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPassword(true);
            }}
          >
            <KeyRound size={15} />
            修改密码
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-text"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={15} />
            退出登录
          </button>
        </div>
      )}
      {password && (
        <ChangePassword notify={notify} onClose={() => setPassword(false)} />
      )}
    </div>
  );
}
