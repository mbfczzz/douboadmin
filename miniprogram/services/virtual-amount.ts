import type { WalletInfo } from "./business";
import { money } from "./business";

export type PurchaseMode = "package" | "custom";

export function customError(info: WalletInfo, fen: number, platform: string) {
  const c = info.virtualCustom;
  if (!c || c.unitAmountFen < 1 || c.unitPointsUnits < 1)
    return "自定义充值暂不可用，请选择积分套餐";
  if (
    !Number.isSafeInteger(fen) ||
    fen < c.minAmountFen ||
    fen > c.maxAmountFen
  )
    return `请输入 ${money(c.minAmountFen)}–${money(c.maxAmountFen)} 元`;
  if (fen % c.unitAmountFen !== 0)
    return `金额须为 ${money(c.unitAmountFen)} 元的整数倍`;
  if (platform === "ios" && (c.unitAmountFen < 100 || fen < 100))
    return "当前设备不支持此充值档位，请选择其他积分套餐";
  const units = (fen / c.unitAmountFen) * c.unitPointsUnits;
  if (!Number.isSafeInteger(units) || units < 1)
    return "积分兑换配置无效，请刷新后重试";
  return "";
}
