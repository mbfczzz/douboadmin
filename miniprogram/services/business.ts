import { ask } from "./dialog";
import { request } from "./request";
import { AuthCancelledError } from "./errors";
import type { Input } from "./types";

export type {
  Wallet,
  Platform,
  WalletInfo,
  VirtualProduct,
  Order,
  Notice,
  Preferences,
} from "./business-types";

// Points read like money: thousands grouped, cents only when present
// ("12,480", "1,234.5" → "1,234.50").
export const points = (n: number) => {
  const [whole, cents] = ((n || 0) / 100).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === "00" ? grouped : grouped + "." + cents;
};
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
  const approved = await ask({
    title: "本次将使用",
    amount: points(q.units),
    unit: "积分",
    content: `生成成功后扣除，失败自动退回\n当前可用 ${points(q.availableUnits)} 积分`,
    confirmText: "确认生成",
    icon: "star",
  });
  if (!approved) throw new AuthCancelledError();
  return { ...input, expectedCostUnits: q.units };
}
