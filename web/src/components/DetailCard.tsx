import type { ReactNode } from "react";
import "./detail.css";

// Grouped key/value block for detail dialogs.
export default function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="detail-card" aria-label={title}>
      <h4>{title}</h4>
      <dl className="detail-grid">{children}</dl>
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

// Headline row of a detail dialog: the main figure followed by tags.
export function DetailHero({
  value,
  caption,
  children,
}: {
  value: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="detail-hero">
      <div>
        <strong>{value}</strong>
        {caption && <small>{caption}</small>}
      </div>
      <div className="detail-tags">{children}</div>
    </div>
  );
}
