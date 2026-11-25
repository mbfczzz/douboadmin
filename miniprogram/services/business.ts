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

export async function confirmBudget(input: Input, quietPerToken = false): Promise<Input> {
  const q = await request<{
    units: number;
    billingEnabled: boolean;
    sufficient: boolean;
    availableUnits: number;
    perSecond?: boolean;
    perToken?: boolean; // units is the most a chat turn can cost
    referenceUnits?: number;
  }>("/jobs/quote", "POST", input);
  if (!q.billingEnabled || !q.units) return { ...input, expectedCostUnits: 0 };
  if (!q.sufficient) {
    throw new Error(
      `可用积分不足，需 ${points(q.units)}，当前 ${points(q.availableUnits)}`,
    );
  }
  if (q.perToken && quietPerToken) return { ...input, expectedCostUnits: q.units };
  if (q.perToken) {
    const ok = await ask({
      title: "本次最多使用",
      amount: points(q.units),
      unit: "积分",
      rows: [
        { label: "计费方式", value: "按量 · 按实际 token 扣除" },
        { label: "当前可用", value: `${points(q.availableUnits)} 积分` },
      ],
      content: "完成后按实际用量扣除，多余积分退回；失败全部退回",
      confirmText: "确认",
      icon: "star",
    });
    if (!ok) throw new AuthCancelledError();
    return { ...input, expectedCostUnits: q.units };
  }
  const seconds = input.kind === "video" && q.perSecond ? input.duration || 0 : 0;
  const referenceUnits = Math.max(0, Math.min(q.referenceUnits || 0, q.units));
  const generationUnits = q.units - referenceUnits;
  const approved = await ask({
    title: "本次将使用",
    amount: points(q.units),
    unit: "积分",
    rows: [
      { label: "计费方式", value: seconds ? `按秒 · 每秒 ${points(Math.round(generationUnits / seconds))} × ${seconds} 秒` : "按次" },
      ...(referenceUnits ? [{ label: "参考视频附加", value: `${points(referenceUnits)} 积分（折后）` }] : []),
      { label: "当前可用", value: `${points(q.availableUnits)} 积分` },
      { label: "确认后剩余", value: `${points(q.availableUnits - q.units)} 积分` },
    ],
    content: "提交后扣除，生成失败自动退回",
    confirmText: "确认生成",
    icon: "star",
  });
  if (!approved) throw new AuthCancelledError();
  return { ...input, expectedCostUnits: q.units };
}
