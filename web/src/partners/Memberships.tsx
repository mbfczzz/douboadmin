import { useState } from "react";
import { ask } from "../confirm/ask";
import { date, type Row } from "../api";
import Records, { useRecords } from "./Records";
import { useCommand } from "./useCommand";
import type { Membership } from "./types";
import { PartnerIdentity, PartnerStatus } from "./PartnerIdentity";
import ActivationTrace from "./ActivationTrace";
import type { Notify } from "../navigation";
import "../components/detail.css";
import { IdChip } from "../components/Tag";
// Each membership change is its own row button; the reason is asked for in a
// small dialog and the change summary is confirmed before it is sent.
const actions = {
  active: {
    label: "恢复",
    title: "恢复用户授权",
    message: "恢复后该用户可继续使用服务商开通的功能。",
    done: "授权已恢复",
  },
  disabled: {
    label: "停用",
    title: "停用用户授权",
    message: "停用后用户暂时无法使用，名额继续保留，可随时恢复。",
    done: "授权已停用",
  },
  unbound: {
    label: "解绑",
    title: "解绑用户授权",
    message: "解绑将停止使用权限并释放名额；历史作品、订单和分佣归属保留。",
    done: "授权已解绑，名额已释放",
  },
} as const;
type Status = keyof typeof actions;

export default function Memberships({
  id,
  notify,
  changed,
}: {
  id: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const resource = useRecords<Membership>(
      "/admin/memberships?provider=" + id,
      15000,
    ),
    [trace, setTrace] = useState(""),
    command = useCommand();
  async function change(row: Row<Membership>, status: Status) {
    const action = actions[status];
    const reason = await ask({
      title: action.title,
      message: action.message,
      confirmText: action.label + "授权",
      danger: status !== "active",
      reason: { label: "原因", minLength: 2 },
      run: (reason) =>
        command.send(
          "/admin/memberships/" + row.id,
          { version: row.version, status, reason },
          "PUT",
          { before: row.data },
        ),
    });
    if (reason === false) return;
    notify(action.done);
    await resource.reload();
    await changed();
  }
  const button = (row: Row<Membership>, status: Status) => (
    <button
      key={status}
      className={
        status === "active" ? "text-button" : "text-button danger-text"
      }
      disabled={command.busy}
      onClick={() => void change(row, status)}
    >
      {actions[status].label}
    </button>
  );
  return (
    <>
      <Records
        title="用户授权绑定"
        description="可按微信用户编号或服务商编号检索。停用不释放名额，解绑才释放。"
        resource={resource}
        columns={[
          { title: "微信用户", render: (r) => <IdChip>{r.id}</IdChip> },
          {
            title: "服务商",
            render: (r) => <PartnerIdentity id={r.data.partnerId} />,
          },
          {
            title: "授权",
            render: (r) => <PartnerStatus state={r.data.status} />,
          },
          { title: "激活时间", render: (r) => date(r.data.activatedAt) },
          {
            title: "来源",
            render: (r) => (
              <button
                className="text-button"
                onClick={() => setTrace(r.data.codeId)}
              >
                查看授权码记录
              </button>
            ),
          },
          {
            title: "操作",
            action: true,
            render: (r) =>
              r.data.status === "unbound" ? (
                "—"
              ) : (
                <div className="business-actions">
                  {button(
                    r,
                    r.data.status === "active" ? "disabled" : "active",
                  )}
                  {button(r, "unbound")}
                </div>
              ),
          },
        ]}
      />
      {trace && <ActivationTrace id={trace} onClose={() => setTrace("")} />}
    </>
  );
}
