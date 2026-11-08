import type { WalletInfo } from "../../services/business";
import type { PurchaseMode } from "../../services/virtual-amount";

export const walletData = {
  productId: "",
  products: [] as Array<{
    id: string;
    name: string;
    amount: string;
    points: string;
  }>,
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
  ledger: [] as Array<{
    id: string;
    title: string;
    note: string;
    change: string;
    tone: string;
    time: string;
  }>,
};

export const loggedOut = {
  ...walletData,
  loading: false,
  needsLogin: true,
};
