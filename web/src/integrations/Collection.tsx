import { useEffect, useRef, useState } from "react";
import type { IntegrationField } from "./types";

type Row = { key: number; values: string[] };
function parse(field: IntegrationField, raw: string): Row[] {
  try {
    const parsed = JSON.parse(raw);
    const values: string[][] =
      field.kind === "products"
        ? parsed.map((p: Record<string, string | number>) =>
            field.columns!.map((c) =>
              String(c.scale ? Number(p[c.key]) / c.scale : p[c.key]),
            ),
          )
        : Object.entries(parsed).map(([k, v]) => [k, String(v)]);
    return values.map((values, key) => ({ key, values }));
  } catch {
    return [];
  }
}

export default function Collection({
  field,
  value,
  onChange,
  disabled,
}: {
  field: IntegrationField;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [rows, setRows] = useState(() => parse(field, value));
  const emitted = useRef(value),
    nextKey = useRef(rows.length);
  const fields = field.columns || [],
    title = field.label;
  useEffect(() => {
    if (value !== emitted.current) {
      const next = parse(field, value);
      setRows(next);
      nextKey.current = next.length;
      emitted.current = value;
    }
  }, [field, value]);
  function update(next: Row[]) {
    setRows(next);
    emitted.current = JSON.stringify(
      field.kind === "products"
        ? next.map((r) =>
            Object.fromEntries(
              fields.map((c, i) => [
                c.key,
                c.scale
                  ? Math.round(Number(r.values[i]) * c.scale)
                  : r.values[i],
              ]),
            ),
          )
        : Object.fromEntries(next.map((r) => r.values)),
    );
    onChange(emitted.current);
  }
  return (
    <section aria-label={title + "配置"}>
      <h3>{title}</h3>
      {rows.map((row, index) => (
        <fieldset className="panel edit-form" key={row.key} disabled={disabled}>
          <legend>
            {title} {index + 1}
          </legend>
          <div className="form-grid">
            {fields.map((field, col) => (
              <label key={field.label}>
                {field.label}
                <input
                  required
                  maxLength={field.max}
                  pattern={field.pattern}
                  inputMode={field.scale ? "decimal" : "text"}
                  value={row.values[col]}
                  ref={(input) => {
                    input?.setCustomValidity(
                      col === 0 &&
                        rows.some(
                          (r) =>
                            r.key !== row.key && r.values[0] === row.values[0],
                        )
                        ? "不能重复"
                        : "",
                    );
                  }}
                  onChange={(e) =>
                    update(
                      rows.map((r) =>
                        r.key === row.key
                          ? {
                              ...r,
                              values: r.values.map((v, i) =>
                                i === col ? e.target.value : v,
                              ),
                            }
                          : r,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => update(rows.filter((r) => r.key !== row.key))}
          >
            移除此项
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={disabled || rows.length >= (field.limit || 0)}
        onClick={() =>
          update([
            ...rows,
            { key: nextKey.current++, values: fields.map(() => "") },
          ])
        }
      >
        添加{title}
      </button>
    </section>
  );
}
