import type { ReactNode } from "react";

export type Tone =
  "accent" | "success" | "info" | "warning" | "danger" | "muted";

// Category label (channel, type, role, method). Statuses use Badge instead.
export default function Tag({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}

// Signed change: increases green, decreases red, zero neutral.
export function Delta({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return (
    <span className={"delta " + (value > 0 ? "up" : value < 0 ? "down" : "")}>
      {value > 0 && "+"}
      {children}
    </span>
  );
}

// Identifiers such as user numbers read as a quiet monospace chip.
export function IdChip({ children }: { children: ReactNode }) {
  return <span className="id-chip">{children}</span>;
}
