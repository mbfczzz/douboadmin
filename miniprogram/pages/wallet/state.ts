import type { WalletInfo } from "../../services/business";
import type { PurchaseMode } from "../../services/virtual-amount";

export const walletData = {
  productId: "",
  products: [] as ReturnType<typeof import("./insights").productCards>,
  price100: "",
  heroArt: [] as string[],
  useArt: { image: "", video: "" } as Record<string, string>,
  uses: [] as Array<{ kind: string; icon: string; title: string; cost: string; count: number; unit: string; model: string }>,
  purchaseMode: "package" as PurchaseMode,
  customAmount: "",
  customStep: "",
  checkoutError: "",
  loading: true,
  needsLogin: false,
  error: "",
  info: null as WalletInfo | null,
  available: "—",
  held: "0",
  amount: "10",
  estimated: "0",
  displayRate: "0",
  allowed: false,
  busy: false,
  pendingOrderId: "",
  paymentWaiting: false,
  paymentNotice: "",
  ledgerPage: 1,
  ledgerPages: 1,
  ledgerTotal: 0,
  ledger: [] as ReturnType<typeof import("./insights").ledgerRows>,
};

export const loggedOut = {
  ...walletData,
  loading: false,
  needsLogin: true,
};
