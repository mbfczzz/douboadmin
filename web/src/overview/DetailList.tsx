import { lazy, Suspense, useState } from "react";
import type { Dashboard } from "../business/types";

const Details = lazy(() => import("./Details"));

// A foldable list under a tab, open by default.
export default function DetailList({
  title,
  data,
  events = false,
}: {
  title: string;
  data: Dashboard;
  events?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <details
      className="panel overview-details overview-section"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && (
        <Suspense fallback="正在加载明细…">
          <Details data={data} events={events} />
        </Suspense>
      )}
    </details>
  );
}
