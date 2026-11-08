import { request } from "./request";
import { AuthCancelledError } from "./errors";
import type { Input } from "./types";

export interface Wallet {
  availableUnits: number;
  heldUnits: number;
  userId: string;
}
export interface Platform {
  billingEnabled: boolean;
  rechargeEnabled: boolean;
  pointsPerYuan: number;
  minRechargeFen: number;
  maxRechargeFen: number;
  supportText: string;
}
export interface WalletInfo {
  paymentChannel?: "wechat_jsapi" | "wechat_virtual";
  virtualProducts?: VirtualProduct[];
  pricing?: {
    ready: boolean;
    retailPer100Fen: number;
    version: string;
    message?: string;
  };
  wallet: Wallet;
  settings: Platform;
  settingsVersion: number;
  paymentReady: boolean;
  iosPayment: boolean;
}
export interface VirtualProduct {
  id: string;
  name: string;
  amountFen: number;
  pointsUnits: number;
}
export interface Order {
  channel?: string;
  virtual?: {
    productId: string;
    productName: string;
    env: number;
    issued: boolean;
  };
  userId: string;
  amountFen: number;
  pointsUnits: number;
  status: string;
  transactionId?: string;
  expiresAt: string;
}
export interface Notice {
  kind: string;
  title: string;
  content: string;
  targetId?: string;
  read: boolean;
}
export interface Preferences {
  inAppNotifications: boolean;
  completionSubscription: boolean;
  autoplay: boolean;
  analytics: boolean;
}
export const points = (n: number) =>
  ((n || 0) / 100).toFixed(2).replace(/\.00$/, "");
export const money = (n: number) => ((n || 0) / 100).toFixed(2);
export const orderStates: Record<string, string> = {
  created: "待支付",
  paid: "已支付",
  closed: "已关闭",
  refunding: "退款处理中",
  refunded: "已退款",
};

export async function confirmBudget(input: Input): Promise<Input> {
  const q = await request<{
    units: number;
    billingEnabled: boolean;
    sufficient: boolean;
    availableUnits: number;
  }>("/jobs/quote", "POST", input);
  if (!q.billingEnabled || !q.units) return { ...input, expectedCostUnits: 0 };
  if (!q.sufficient) {
    throw new Error(
      `可用积分不足，需 ${points(q.units)}，当前 ${points(q.availableUnits)}`,
    );
  }
  const choice = await wx.showModal({
    title: "确认使用积分",
    content: `本次将预留 ${points(q.units)} 积分，生成成功后扣除，明确失败后退回。`,
    confirmText: "确认生成",
  });
  if (!choice.confirm) throw new AuthCancelledError();
  return { ...input, expectedCostUnits: q.units };
}
