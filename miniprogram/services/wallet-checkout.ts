import { ask } from "./dialog";
import type { WalletInfo } from "./business";
import { money, points } from "./business";
import { amountFen, devicePlatform } from "./payment";
import { customError } from "./virtual-amount";
import type { PurchaseMode } from "./virtual-amount";
import { deferPayment } from "./payment-status";
import { sessionToken } from "./session";

export function estimateCheckout(
  info: WalletInfo | null,
  amount: string,
  productId: string,
  mode: PurchaseMode = "package",
) {
  if (info?.paymentChannel === "wechat_virtual") {
    if (mode === "custom") {
      const fen = amountFen(amount),
        c = info.virtualCustom;
      const problem = customError(info, fen, devicePlatform());
      return {
        amount,
        estimated: problem
          ? "—"
          : points((fen / c!.unitAmountFen) * c!.unitPointsUnits),
        displayRate: "0",
        checkoutError: !c || amount.trim() ? problem : "",
        customStep: c ? money(c.unitAmountFen) : "",
      };
    }
    const selected = info.virtualProducts?.find((p) => p.id === productId);
    return {
      amount: selected ? money(selected.amountFen) : "",
      estimated: selected ? points(selected.pointsUnits) : "0",
      displayRate: "0",
      checkoutError: "",
      customStep: "",
    };
  }
  const numerator = (info?.settings.pointsPerYuan || 0) * 10000,
    denominator = info?.pricing?.retailPer100Fen || 10000;
  return {
    estimated: points(
      Math.floor((amountFen(amount) * numerator) / denominator),
    ),
    displayRate: points(Math.floor((100 * numerator) / denominator)),
    checkoutError: "",
    customStep: "",
  };
}

export async function confirmAdditionalPurchase(
  id: string,
  owner: string,
): Promise<boolean> {
  const token = sessionToken();
  const confirmed = await ask({
    title: "另购一笔积分？",
    content: "原订单仍可能到账。另购会新建一笔付费订单，原订单可在充值订单中继续查询。",
    confirmText: "另购一笔",
    cancelText: "继续等待",
    icon: "time",
  });
  if (!confirmed || !token || sessionToken() !== token) return false;
  deferPayment(id, owner);
  return true;
}
