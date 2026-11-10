import type { ReactNode } from "react";

export type Stat = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger";
};

// Headline numbers for an editor tab, with the tab's main actions beside them.
export default function TabSummary({
  stats,
  actions,
  children,
}: {
  stats: Stat[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="tab-summary" aria-label="概览">
      <div className="tab-summary-main">
        <dl>
          {stats.map((s) => (
            <div key={s.label} className={s.tone}>
              <dt>{s.label}</dt>
              <dd>
                {s.value}
                {s.note && <small>{s.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
