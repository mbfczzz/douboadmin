import { api, type Row } from "../api";
import type { AdminAccount } from "../adminAccounts/types";

type Change = { role?: string; disabled?: boolean; password?: string };

// The provider-account endpoint takes the whole account state, so each row
// action sends the current values plus its one change.
export function saveAccount(
  partnerId: string,
  account: Row<AdminAccount>,
  change: Change,
  roleName?: (id: unknown) => string,
) {
  const body = {
    version: account.version,
    role: change.role ?? account.data.role,
    disabled: change.disabled ?? !!account.data.disabled,
    ...(change.password ? { password: change.password } : {}),
  };
  return api(`/admin/partners/${partnerId}/account`, {
    method: "PUT",
    body: JSON.stringify(body),
    // A password reset is confirmed by its own dialog and never summarised.
    confirmation: change.password
      ? false
      : {
          before: account.data,
          title:
            change.disabled === undefined
              ? "修改登录角色"
              : change.disabled
                ? "停用服务商登录"
                : "启用服务商登录",
          format: roleName ? { role: roleName } : undefined,
        },
  });
}

export function createAccount(
  partnerId: string,
  input: { username: string; password: string; role: string },
) {
  return api(`/admin/partners/${partnerId}/account`, {
    method: "PUT",
    body: JSON.stringify({ version: 0, disabled: false, ...input }),
    confirmation: false,
  });
}
