// Readable values for change summaries, keyed by field name. Callers can add
// their own (e.g. role ids → role names) through ConfirmationOptions.format.
const statusNames: Record<string, string> = {
  active: "正常",
  disabled: "已停用",
  unbound: "已解绑",
  pending: "待处理",
  paid: "已打款",
  cancelled: "已取消",
};
const kindNames: Record<string, string> = { grant: "划拨", reclaim: "收回" };
const yuan = (value: unknown) =>
  typeof value === "number" ? (value / 100).toFixed(2) + " 元" : undefined;

export const valueFormats: Record<
  string,
  (value: unknown) => string | undefined
> = {
  status: (v) => statusNames[String(v)],
  kind: (v) => kindNames[String(v)],
  amountFen: yuan,
  retailPer100Fen: yuan,
  approve: (v) => (v === true ? "批准" : v === false ? "拒绝" : undefined),
};

// Missing booleans read as "否" and missing text as empty, so sending
// disabled:false for a record without the field is not a change.
export function sameValue(before: unknown, after: unknown) {
  const norm = (v: unknown, other: unknown) =>
    v === undefined || v === null
      ? typeof other === "boolean"
        ? false
        : typeof other === "string"
          ? ""
          : v
      : v;
  return (
    JSON.stringify(norm(before, after)) === JSON.stringify(norm(after, before))
  );
}

export const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
