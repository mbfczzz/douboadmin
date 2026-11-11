import { useRoles, type RoleScope } from "./types";
import { businessRoleIDs } from "./business";

// Role picker for admin and provider login accounts.
export default function RoleSelect({
  scope,
  value,
  disabled,
  name = "role",
  providerRole,
}: {
  scope: RoleScope;
  value?: string;
  disabled?: boolean;
  name?: string;
  providerRole?: string;
}) {
  const resource = useRoles(scope);
  const rows = resource.rows.filter(
    (row) =>
      !providerRole ||
      !businessRoleIDs.includes(row.id) ||
      row.id === providerRole,
  );
  const fallback =
    providerRole || (scope === "partner" ? "partner" : "operator");
  return (
    <select
      name={name}
      key={rows.length}
      defaultValue={value || fallback}
      disabled={disabled || resource.loading || !!resource.error}
    >
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.data.name}
        </option>
      ))}
    </select>
  );
}
