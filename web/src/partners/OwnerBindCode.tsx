import { useState } from "react";
import CodeView from "./CodeCard";
import BoundOwner from "./BoundOwner";
import CodeUses from "./CodeUses";
import type { Notify } from "../navigation";

// Binding the provider's own responsible person is a management action,
// separate from recruiting providers or opening their members' accounts.
export default function OwnerBindCode({
  id,
  name,
  notify,
}: {
  id: string;
  name: string;
  notify: Notify;
}) {
  const [open, setOpen] = useState(false);
  const path = `/admin/partners/${encodeURIComponent(id)}/codes/bind`;
  return (
    <details
      className="owner-bind"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>负责人绑定码</summary>
      {open && (
        <>
          <CodeView
            path={path}
            title="负责人绑定码"
            note="仅用于负责人绑定自己的小程序账号，总部开通后生效；一次有效。"
            file={`${name}-负责人绑定码.png`}
            notify={notify}
            bound={(user, pending, reload) => (
              <BoundOwner
                path={path}
                user={user}
                pending={pending}
                reload={reload}
                notify={notify}
              />
            )}
          />
          <CodeUses id={id} kind="bind" />
        </>
      )}
    </details>
  );
}
