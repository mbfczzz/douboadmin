import { ask } from "../confirm/ask";
import { date, type Row } from "../api";
import Records, { useRecords } from "./Records";
import { useCommand } from "./useCommand";
import type { Membership } from "./types";
import { joinMethod } from "../business/types";
import { PartnerStatus } from "./PartnerIdentity";
import type { Notify } from "../navigation";
import "../components/detail.css";
import Tag, { IdChip } from "../components/Tag";
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
    message: "停用后用户暂时无法使用，可随时恢复。",
    done: "授权已停用",
  },
  unbound: {
    label: "解绑",
    title: "解绑用户授权",
    message:
      "解绑将停止使用权限，用户可重新扫码登记；历史作品、订单和分佣归属保留。",
    done: "授权已解绑",
  },
} as const;
type Status = keyof typeof actions;
// Registrations wait for the platform; only an opened membership changes here.
const states: Record<string, string> = {
  pending: "待开通",
  rejected: "已拒绝",
};

export default function Memberships({
  id,
  code,
  notify,
  changed,
}: {
  id: string;
  code: string;
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const resource = useRecords<Membership>(
      "/admin/memberships?" + new URLSearchParams({ provider: id, code }),
      15000,
    ),
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
        placeholder="搜索用户编号或推荐人编号"
        title="已加入的会员"
        resource={resource}
        columns={[
          { title: "微信用户", render: (r) => <IdChip>{r.id}</IdChip> },
          {
            title: "推荐人",
            render: (r) =>
              r.data.referrer ? <IdChip>{r.data.referrer}</IdChip> : "—",
          },
          {
            title: "授权",
            render: (r) => (
              <PartnerStatus
                state={r.data.status}
                label={states[r.data.status]}
              />
            ),
          },
          { title: "加入时间", render: (r) => date(r.data.activatedAt) },
          {
            title: "加入方式",
            render: (r) => (
              <Tag tone={r.data.method === "scan" ? "info" : "muted"}>
                {joinMethod(r.data.method)}
              </Tag>
            ),
          },
          {
            title: "操作",
            action: true,
            render: (r) =>
              r.data.status !== "active" && r.data.status !== "disabled" ? (
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
    </>
  );
}
