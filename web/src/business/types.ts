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
  mixPoints: number;
  reviewRequired: boolean;
  supportText: string;
  hotKeywords: string[];
  ttsModel: string;
  rewriteModel: string;
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
  statusReason?: string;
}
export interface Music {
  title: string;
  assetId: string;
  published: boolean;
  sort: number;
  url?: string;
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
}
export interface Dashboard {
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
export const money = (fen: number) => "¥" + ((fen || 0) / 100).toFixed(2);
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
