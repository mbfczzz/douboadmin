import { api, type Row } from "../api";
import { ask } from "../confirm/ask";
import type { AdminAccount } from "./types";

// One request per row action so each button does exactly one thing.
type Account = Row<AdminAccount>;
const path = (row: Account) => `/admin/accounts/${row.id}`;

// Flip disabled only; the confirmation dialog shows the single change.
export function setDisabled(row: Account, disabled: boolean) {
  const { name, phone, role } = row.data;
  return api<Account>(path(row), {
    method: "PUT",
    body: JSON.stringify({ name, phone, role, disabled, version: row.version }),
    confirmation: {
      before: row.data,
      title: disabled ? "停用管理账号" : "启用管理账号",
    },
  });
}

export function resetPassword(row: Account, password: string) {
  return api<Account>(path(row) + "/password", {
    method: "PUT",
    // The reset dialog is the confirmation; the password never enters a summary.
    confirmation: false,
    body: JSON.stringify({ version: row.version, password }),
  });
}

export async function archive(row: Account) {
  const ok = await ask({
    title: "归档管理账号？",
    message: `「${row.data.name}」（${row.data.username}）归档后将无法登录，操作记录保留。`,
    confirmText: "归档账号",
    danger: true,
    run: () =>
      api(path(row), {
        method: "DELETE",
        body: JSON.stringify({ version: row.version }),
      }),
  });
  return ok !== false;
}
