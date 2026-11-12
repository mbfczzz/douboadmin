import { useEffect, useRef, useState } from "react";
import { api, type Row } from "../api";
import { ask } from "../confirm/ask";
import type { Notify } from "../navigation";
import { useMe, canApproveRegistrations } from "../session";

export type Registration = {
  role: string;
  partnerId: string;
  parentId?: string;
  referrer?: string;
  codeKind: string;
  code: string;
  method: string;
  name: string;
  phone: string;
  status: string;
  reason?: string;
  registeredAt?: string;
  canReview?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
};

// Every entry uses the registration's version, never a provider/usage version.
// Fetch only the selected row when reviewing from a tree or usage record.
export function useRegistrationDecision(
  notify: Notify,
  changed: () => Promise<void>,
  scope = "",
) {
  const me = useMe(),
    canApprove = canApproveRegistrations(me);
  const permissionScope = `${scope}/${me?.id}/${me?.role}/${me?.canApproveRegistrations}`;
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const currentScope = useRef(permissionScope);
  currentScope.current = permissionScope;
  useEffect(() => {
    setBusy(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [permissionScope]);
  async function decide(
    selected: string | Row<Registration>,
    approve: boolean,
    expected?: { code?: string; partnerId?: string; role?: string },
  ) {
    if (approve && !canApprove) {
      notify("仅超级管理员可开通账号", "error");
      return;
    }
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const current = () =>
      !controller.signal.aborted && currentScope.current === permissionScope;
    setBusy(true);
    try {
      const row =
        typeof selected === "string"
          ? await api<Row<Registration>>(
              `/admin/registrations/${encodeURIComponent(selected)}`,
              { signal: controller.signal },
            )
          : selected;
      if (!current()) return;
      if (
        row.data.status !== "pending" ||
        Object.entries(expected || {}).some(
          ([key, value]) =>
            value !== undefined &&
            row.data[key as keyof Registration] !== value,
        )
      ) {
        notify("该登记已更新，请刷新后重试");
        await changed();
        return;
      }
      const names = await api<Record<string, string>>("/admin/roles/labels", {
        signal: controller.signal,
      });
      if (!current()) return;
      const who = row.data.name || row.id,
        role = names[row.data.role] || row.data.role;
      const ok = await ask({
        signal: controller.signal,
        title: approve ? "开通登记" : "拒绝登记",
        message: approve
          ? `「${who}」将以${role}角色开通，开通后即可使用。`
          : `拒绝「${who}」的${role}登记，用户可重新扫码登记。`,
        confirmText: approve ? "开通" : "拒绝",
        danger: !approve,
        reason: approve
          ? undefined
          : { label: "拒绝原因", minLength: 2, maxLength: 200 },
        run: (reason) => {
          if (!current()) throw new Error("审批页面已切换，请取消后重试");
          return api(`/admin/registrations/${encodeURIComponent(row.id)}`, {
            method: "PUT",
            confirmation: false,
            body: JSON.stringify({ approve, reason, version: row.version }),
          });
        },
      });
      if (ok === false || !current()) return;
      notify(approve ? `${who} 已开通` : `已拒绝 ${who} 的登记`);
      await changed();
    } catch (error) {
      if (current()) notify((error as Error).message);
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (current()) setBusy(false);
      }
    }
  }
  return { decide, busy };
}
