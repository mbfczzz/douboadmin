import { api, type Row } from "../api";
import { ask } from "../confirm/ask";
import type { Notify } from "../navigation";
import type { Partner } from "./types";

// 下级小程序开通权限: which providers hold the switch and whom each may open.
const reach: Record<string, string> = {
  branch: "一级服务商、二级服务商和合伙人",
  s1: "二级服务商和合伙人",
  s2: "合伙人",
};
export const holdsActivationRight = (role: string) => role in reach;

// The super administrator's switch for one provider. Each provider is set on
// its own; nothing passes to or from its parent or children.
export async function toggleActivationRight(
  row: Row<Partner>,
  roleName: (role: string) => string,
  notify: Notify,
  changed: () => Promise<void>,
) {
  const on = !row.data.activateChildren,
    who = `${roleName(row.data.role)}「${row.data.name}」`;
  const ok = await ask({
    title: on ? "开启下级小程序开通权限？" : "关闭下级小程序开通权限？",
    message: on
      ? `开启后，${who}可在后台自行开通或拒绝名下${reach[row.data.role]}的小程序使用权限。`
      : `关闭后，${who}名下的开通只能由超级管理员操作。`,
    confirmText: on ? "开启" : "关闭",
    danger: !on,
    run: () =>
      api(`/admin/partners/${encodeURIComponent(row.id)}/activation`, {
        method: "PUT",
        body: JSON.stringify({ enabled: on, version: row.version }),
        confirmation: false,
      }),
  });
  if (ok === false) return;
  await changed();
  notify(on ? "已开启下级开通权限" : "已关闭下级开通权限");
}
