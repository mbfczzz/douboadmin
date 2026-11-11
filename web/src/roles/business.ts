import { useResource } from "../hooks/useResource";
import { roleName as fallbackName } from "../business/types";

export const businessRoleIDs = ["branch", "s1", "s2", "member"];

export function useBusinessRoleNames() {
  const resource = useResource<Record<string, string>>("/admin/roles/labels");
  return (id?: string) => resource.data?.[id || ""] || fallbackName(id);
}
