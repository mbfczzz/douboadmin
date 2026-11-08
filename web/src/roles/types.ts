import { useResource } from "../hooks/useResource";

export type RoleScope = "platform" | "partner";
export interface AdminRoleDef {
  name: string;
  scope: RoleScope;
  menus: string[];
  system?: boolean;
}
export interface RoleRow {
  id: string;
  version: number;
  data: AdminRoleDef;
  accounts: number;
}
export const roleScopeLabel: Record<RoleScope, string> = {
  platform: "平台角色",
  partner: "服务商角色",
};
// Provider roles may only see provider data; mirrors core.PartnerMenus.
export const partnerMenus = ["partners"];

export function useRoles(scope?: RoleScope) {
  const resource = useResource<RoleRow[]>("/admin/roles");
  const rows = (resource.data || []).filter(
    (row) => !scope || row.data.scope === scope,
  );
  return { ...resource, rows };
}
