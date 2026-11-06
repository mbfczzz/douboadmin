import type { WalletInfo } from "./business";
import { money, points } from "./business";
import { amountFen } from "./payment";
import { deferPayment } from "./payment-status";
import { sessionToken } from "./session";

export function estimateCheckout(
  info: WalletInfo | null,
  amount: string,
  productId: string,
) {
  if (info?.paymentChannel === "wechat_virtual") {
    const selected = info.virtualProducts?.find((p) => p.id === productId);
    return {
      amount: selected ? money(selected.amountFen) : "",
      estimated: selected ? points(selected.pointsUnits) : "0",
      displayRate: "0",
    };
  }
  const numerator = (info?.settings.pointsPerYuan || 0) * 10000,
    denominator = info?.pricing?.retailPer100Fen || 10000;
  return {
    estimated: points(Math.floor((amountFen(amount) * numerator) / denominator)),
    displayRate: points(Math.floor((100 * numerator) / denominator)),
  };
}

export async function confirmAdditionalPurchase(
  id: string,
  owner: string,
): Promise<boolean> {
  const token = sessionToken();
  const confirmed = await new Promise<boolean>((resolve) =>
    wx.showModal({
      title: "另购一笔积分？",
      content:
        "原订单支付结果仍未确认，之后仍可能到账。另购会创建新的付费订单；原订单可在充值订单中继续查询。",
      confirmText: "另购一笔",
      cancelText: "继续等待",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  );
  if (!confirmed || !token || sessionToken() !== token) return false;
  deferPayment(id, owner);
  return true;
}
