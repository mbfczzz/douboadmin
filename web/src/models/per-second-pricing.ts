import type { ModelSettings } from "./types";

type Matrix = NonNullable<ModelSettings["priceMatrix"]>;
const maxPoints = 1e9;

export function perSecondError(value: string, durations: number[]) {
  if (!value.trim()) return "";
  const rate = Number(value),
    cents = rate * 100;
  if (!Number.isFinite(rate) || rate < 0) return "请输入不小于 0 的每秒积分";
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim()))
    return "每秒积分请使用普通数字，最多保留两位小数";
  if (
    rate > maxPoints ||
    durations.some((d) => Math.round(cents) * d > maxPoints * 100)
  )
    return "填充后的单项积分不能超过 10 亿";
  return "";
}

export function fillPerSecond(
  matrix: Matrix | undefined,
  resolution: string,
  durations: number[],
  value: string,
): Matrix {
  if (!value.trim() || perSecondError(value, durations))
    throw new Error("每秒积分无效");
  const cents = Math.round(Number(value) * 100);
  const next = { ...matrix };
  for (const duration of durations)
    next[`${duration}s`] = {
      ...next[`${duration}s`],
      [resolution]: (cents * duration) / 100,
    };
  return next;
}

// Reopen a consistently filled column with its rate; mixed or blank columns stay blank.
export function inferPerSecond(
  matrix: Matrix | undefined,
  resolution: string,
  durations: number[],
) {
  const first = durations[0],
    price = matrix?.[`${first}s`]?.[resolution];
  if (!first || price === undefined) return "";
  const cents = Math.round((price * 100) / first);
  return durations.every(
    (d) => matrix?.[`${d}s`]?.[resolution] === (cents * d) / 100,
  )
    ? String(cents / 100)
    : "";
}
