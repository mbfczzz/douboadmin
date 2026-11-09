// Formatting shared by overview widgets.
export const pct = (part: number, whole: number) =>
  whole ? `${((part / whole) * 100).toFixed(1)}%` : "—";
export const seconds = (ms: number, count: number) =>
  count ? `${(ms / count / 1000).toFixed(1)} 秒` : "—";
export { kindNames } from "../business/types";
