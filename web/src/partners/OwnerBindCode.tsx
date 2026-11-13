import { useState } from "react";
import CodeView from "./CodeCard";
import BoundOwner from "./BoundOwner";
import CodeUses from "./CodeUses";
import { useShareCode } from "./useShareCode";
import type { Notify } from "../navigation";

// Binding the provider's own responsible person is a management action,
// separate from recruiting providers or opening their members' accounts.
export default function OwnerBindCode({
  id,
  name,
  reviewerId,
  notify,
  changed,
}: {
  id: string;
  name: string;
  reviewerId: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const path = `/admin/partners/${encodeURIComponent(id)}/codes/bind`;
  const share = useShareCode(open ? path : null);
  return (
    <details
      className="owner-bind"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>负责人绑定码</summary>
      {open && (
        <>
          <CodeView
            owner={name}
            path={path}
            title="负责人绑定码"
            note="仅用于负责人绑定自己的小程序账号，超级管理员开通后生效；一次有效。"
            file={`${name}-负责人绑定码.png`}
            notify={notify}
            share={share}
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
          <CodeUses
            id={id}
            kind="bind"
            code={share.data?.code}
            reviewerId={reviewerId}
            notify={notify}
            changed={async () => {
              await share.reload();
              await changed();
            }}
          />
        </>
      )}
    </details>
  );
}
