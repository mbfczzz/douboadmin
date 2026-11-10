import type { Row } from "./types";

export type FinancePage<T> = {
  items: Row<T>[];
  page: number;
  size: number;
  total: number;
};

// Older API versions returned arrays. They cannot provide further pages.
export function financePage<T>(
  value: FinancePage<T> | Row<T>[],
  page: number,
): FinancePage<T> {
  return Array.isArray(value)
    ? {
        items: value,
        page,
        size: Math.max(value.length, 20),
        total: value.length,
      }
    : value;
}
