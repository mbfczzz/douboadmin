import { useRoles, type RoleScope } from "./types";

// Role picker for admin and provider login accounts.
export default function RoleSelect({
  scope,
  value,
  disabled,
  name = "role",
}: {
  scope: RoleScope;
  value?: string;
  disabled?: boolean;
  name?: string;
}) {
  const { rows, loading } = useRoles(scope);
  const fallback = scope === "partner" ? "partner" : "operator";
  return (
    <select
      name={name}
      key={rows.length}
      defaultValue={value || fallback}
      disabled={disabled || loading}
    >
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.data.name}
        </option>
      ))}
    </select>
  );
}
