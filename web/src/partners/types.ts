import type { Tone } from "../components/Tag";
import type { Row } from "../api";
import type { Notify } from "../navigation";
export type Partner = {
  name: string;
  // branch (分公司), s1 (S1 服务商) or s2 (S2 推荐官).
  role: string;
  parentId: string;
  path: string[];
  // active, disabled, or pending until the platform approves a scan.
  status: string;
  retailPer100Fen: number;
  childMarginBps: number;
  // The mini-program account that runs it (by invite or bind code).
  ownerUser?: string;
};
export type Price = {
  enabled: boolean;
  version: string;
  costPer100Fen: number;
  incomingPer100Fen: number;
  retailPer100Fen: number;
  shares: { partnerId: string; name: string; amountFen: number }[];
};
export type Overview = {
  record: Row<Partner>;
  price: Price;
  priceError?: string;
  commission: { balanceFen: number; heldFen: number; paidOutFen: number };
};
export type PageData<T> = {
  items: Row<T>[];
  page: number;
  size: number;
  total: number;
};
export type Membership = {
  partnerId: string;
  status: string;
  codeId: string;
  method?: string;
  // The member whose promo code was used.
  referrer?: string;
  activatedAt: string;
  reason?: string;
};
export type Policy = {
  enabled: boolean;
  costPer100Fen: number;
  rootMarginBps: number;
};
export type CommissionEntry = {
  partnerId: string;
  orderId?: string;
  refundId?: string;
  kind: string;
  amountFen: number;
  heldDelta: number;
  balanceAfter: number;
  note: string;
};
export type Payout = {
  partnerId: string;
  amountFen: number;
  status: string;
  reference?: string;
  note: string;
};
export type Scope = {
  id: string;
  view: Overview;
  changed: () => Promise<void>;
  notify: Notify;
};
export const labels: Record<string, string> = {
  active: "已启用",
  disabled: "已停用",
  pending: "待处理",
  used: "已使用",
  revoked: "已撤销",
  expired: "已过期",
  unbound: "已解绑",
  provider_disabled: "上级停用",
  approved: "已批准",
  rejected: "已拒绝",
  paid: "已打款",
  cancelled: "已取消",
  recharge: "充值分佣",
  refund_hold: "退款冻结",
  refund_cancel: "退款关闭",
  refund_reverse: "退款冲回",
  payout_hold: "提现预留",
  payout_paid: "提现打款",
  payout_cancel: "提现取消",
};
export function hundredths(value: FormDataEntryValue | null) {
  const text = String(value || "");
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw Error("请输入最多两位小数的非负数字");
  return Math.round(Number(text) * 100);
}
// Tag tones for commission ledger kinds.
export const kindTones: Record<string, Tone> = {
  recharge: "success",
  refund_hold: "warning",
  refund_cancel: "muted",
  refund_reverse: "danger",
  payout_hold: "warning",
  payout_paid: "info",
  payout_cancel: "muted",
};

// Matches the server: the platform adds 分公司, a 分公司 adds S1 or S2 and an
// S1 adds S2. Only the platform adds providers by hand; others grow by codes.
export const growth: Record<string, string[]> = {
  root: ["branch"],
  branch: ["s1", "s2"],
  s1: ["s2"],
};
