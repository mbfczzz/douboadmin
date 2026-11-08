import Badge from "./Badge";
import { statuses, statusTones } from "../business/types";

// Business record statuses (orders, refunds, reviews) shown as tone badges.
export default function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      state={statusTones[status] || "muted"}
      label={statuses[status] || status}
    />
  );
}
