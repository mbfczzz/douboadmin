import type { Tone } from "../components/Tag";
export interface Wallet {
  userId: string;
  availableUnits: number;
  heldUnits: number;
}
export interface Ledger {
  kind: string;
  reference: string;
  availableDelta: number;
  heldDelta: number;
  availableAfter: number;
  heldAfter: number;
  actor?: string;
  note: string;
}
export interface Order {
  channel?: string;
  virtual?: {
    productName: string;
    platform: string;
    purchaseMode?: string;
    quantity?: number;
    unitFen?: number;
    issued?: boolean;
  };
  userId: string;
  amountFen: number;
  pointsUnits: number;
  status: string;
  transactionId?: string;
  refundId?: string;
  paidAt?: string;
  expiresAt: string;
}
export interface Refund {
  orderId: string;
  userId: string;
  amountFen: number;
  pointsUnits: number;
  status: string;
  reason: string;
  providerId?: string;
  error?: string;
}
export interface PaymentRecord {
  transactionId: string;
  orderId: string;
  userId: string;
  channel: string;
  amountFen: number;
  pointsUnits: number;
  status: string;
  paidAt: string;
  confirmedAt: string;
  refundId?: string;
}
export interface PaymentPage {
  items: PaymentRecord[];
  total: number;
  page: number;
  size: number;
}
export interface Platform {
  billingEnabled: boolean;
  rechargeEnabled: boolean;
  pointsPerYuan: number;
  minRechargeFen: number;
  maxRechargeFen: number;
  reviewRequired: boolean;
  supportText: string;
  hotKeywords: string[];
  alarmFailures: number;
  alarmQueueMinutes: number;
}
export interface Review {
  jobId: string;
  kind: string;
  status: string;
  reason?: string;
  reviewer?: string;
  reviewedAt?: string;
}
export interface Profile {
  access?: {
    active: boolean;
    status: string;
    partnerId?: string;
    partnerName?: string;
    message?: string;
  };
  nickname: string;
  name?: string;
  phone?: string;
  bio?: string;
  disabled?: boolean;
  archived?: boolean;
  statusReason?: string;
}
export interface Daily {
  date: string;
  newUsers: number;
  activeUsers: number;
  jobs: number;
  succeeded: number;
  failed: number;
  paidFen: number;
  refundFen: number;
  revenueFen: number;
  paidOrders?: number;
  spentUnits?: number;
}
export interface KindStat {
  jobs: number;
  succeeded: number;
  failed: number;
  spentUnits: number;
  durationMs: number;
  timed: number;
}
export interface Breakdown {
  totalUsers: number;
  activeUsers: number;
  creatorUsers: number;
  payers: number;
  kinds: Record<string, KindStat>;
  hours: number[];
  weekdays: number[];
  ordersCreated: number;
  ordersPaid: number;
  pointsSold: number;
  channels: Record<string, { orders: number; amountFen: number }>;
  refunds: number;
  directActivations: number;
  providerActivations: number;
  codesIssued: number;
  codesRedeemed: number;
  providers: { id: string; name: string; activations: number }[];
}
export interface Dashboard {
  breakdown?: Breakdown;
  days: Daily[];
  models: {
    model: string;
    calls: number;
    known: number;
    estimatedMicros: number;
  }[];
  events: Record<string, number>;
  period: number;
}
export const points = (units: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
    (units || 0) / 100,
  );
// Thousands separators like points, so large amounts read the same way.
const yuan = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const money = (fen: number) => "¥" + yuan.format((fen || 0) / 100);
export const statuses: Record<string, string> = {
  created: "待支付",
  paid: "已支付",
  closed: "已关闭",
  refunding: "退款处理中",
  refunded: "已退款",
  pending: "待处理",
  processing: "处理中",
  abnormal: "需人工处理",
  succeeded: "已完成",
  approved: "已通过",
  rejected: "未通过",
};
// Badge tone for each business status; unknown states render neutral.
export const statusTones: Record<string, string> = {
  created: "queued",
  pending: "queued",
  refunding: "running",
  processing: "running",
  paid: "succeeded",
  succeeded: "succeeded",
  approved: "succeeded",
  abnormal: "failed",
  rejected: "failed",
};
export const ledgerLabels: Record<string, string> = {
  topup: "充值到账",
  admin_adjust: "管理员调整",
  job_hold: "任务预留",
  job_charge: "生成扣减",
  job_release: "失败退回",
  refund_hold: "退款预留",
  refund_complete: "退款回收",
  refund_cancel: "退款关闭",
};
// Tag tones for categories that were plain text in tables.
export const ledgerTones: Record<string, Tone> = {
  topup: "success",
  admin_adjust: "info",
  job_hold: "warning",
  job_charge: "accent",
  job_release: "info",
  refund_hold: "warning",
  refund_complete: "danger",
  refund_cancel: "muted",
};
export const channels: Record<string, [string, Tone]> = {
  wechat_jsapi: ["微信支付", "success"],
  wechat_virtual: ["微信虚拟支付", "accent"],
};
export const kindNames: Record<string, string> = {
  image: "图片",
  video: "视频",
  chat: "Agent 对话",
  audio: "配音",
  mix: "混剪",
};
