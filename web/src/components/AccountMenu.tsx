import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { Me } from "../session";
import type { Notify } from "../navigation";
import ChangePassword from "./ChangePassword";
import AccountPanel from "./AccountPanel";
import "./account-menu.css";

// Signed-in account: who you are, recent sign-ins, password, own logs, sign out.
export default function AccountMenu({
  me,
  notify,
  onLogs,
  onLogout,
}: {
  me: Me;
  notify: Notify;
  onLogs?: () => void;
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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`账号菜单：${name}`}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{name[0]}</span>
        <b>{name}</b>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-popover" role="dialog" aria-label="账号">
          <AccountPanel
            me={me}
            name={name}
            onPassword={() => {
              setOpen(false);
              setPassword(true);
            }}
            onLogs={
              onLogs &&
              (() => {
                setOpen(false);
                onLogs();
              })
            }
            onLogout={() => {
              setOpen(false);
              onLogout();
            }}
          />
        </div>
      )}
      {password &&
        // Rendered on <body>: inside the sticky top bar the dialog would sit
        // under the sidebar's stacking layer.
        createPortal(
          <ChangePassword notify={notify} onClose={() => setPassword(false)} />,
          document.body,
        )}
    </div>
  );
}
