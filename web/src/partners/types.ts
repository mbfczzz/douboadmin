import type { Row } from "../api";
export type Partner = {
  name: string;
  parentId: string;
  path: string[];
  status: string;
  retailPer100Fen: number;
  childMarginBps: number;
};
export type Pool = {
  granted: number;
  allocated: number;
  reserved: number;
  used: number;
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
  quota: { users: Pool; partners: Pool };
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
  activatedAt: string;
  reason?: string;
};
export type Code = {
  actor: string;
  creatorAccount?: string;
  partnerName?: string;
  activatedNickname?: string;
  activationMethod?: string;
  usedAt?: string;
  partnerId: string;
  label: string;
  suffix: string;
  status: string;
  expiresAt: string;
  userId?: string;
};
export const activationMethod = (method?: string) =>
  method === "qr" ? "扫码" : method === "code" ? "激活码" : "未记录";
export const traceTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "—";
export type Move = {
  parentId: string;
  childId: string;
  users: number;
  partners: number;
  kind: string;
  reason: string;
};
export type QuotaRequest = {
  partnerId: string;
  parentId: string;
  users: number;
  partners: number;
  status: string;
  reason: string;
  decision?: string;
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
  notify: (s: string) => void;
};
export const available = (pool: Pool) =>
  pool.granted - pool.allocated - pool.reserved - pool.used;
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
  grant: "划拨",
  reclaim: "收回",
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
