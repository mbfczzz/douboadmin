import { useId, type ReactNode } from "react";

export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="config-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function Field({
  label,
  hint,
  span = 1,
  children,
}: {
  label: string;
  hint?: string;
  span?: 1 | 2 | 4;
  children: ReactNode;
}) {
  return (
    <label className={`config-field col-${span}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="config-section" role="group" aria-labelledby={id}>
      <div id={id} className="config-label">
        {label}
      </div>
      {children}
      {hint && <small className="config-hint">{hint}</small>}
    </div>
  );
}
export function Chips({
  options,
  selected,
  onChange,
  labels = {},
  allowed = options,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  labels?: Record<string, string>;
  allowed?: string[];
}) {
  return (
    <div className="config-chips">
      {options.map((v) => (
        <button
          type="button"
          key={v}
          disabled={!allowed.includes(v)}
          aria-pressed={selected.includes(v)}
          onClick={() =>
            onChange(
              options.filter((x) =>
                x === v ? !selected.includes(x) : selected.includes(x),
              ),
            )
          }
        >
          {labels[v] || v}
        </button>
      ))}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  hint,
  span = 1,
  max = 1e9,
  integer = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  span?: 1 | 2 | 4;
  max?: number;
  integer?: boolean;
}) {
  return (
    <Field label={label} span={span} hint={hint}>
      <input
        aria-label={label}
        type="number"
        min={0}
        max={max}
        step={integer ? 1 : "any"}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
