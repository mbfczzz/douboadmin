import type { WalletInfo } from "../../services/business";
import type { PurchaseMode } from "../../services/virtual-amount";

export const walletData = {
  productId: "",
  products: [] as ReturnType<typeof import("./insights").productCards>,
  price100: "",
  backdrop: "", // glass stars fading in from the right (showArt)
  // "能做什么" covers: bundled photos of a photo print and a cinema camera.
  useArt: { image: "/assets/photos/use-image.jpg", video: "/assets/photos/use-video.jpg" } as Record<string, string>,
  uses: [] as Array<{ kind: string; title: string; cost: string; units: number; count: number; unit: string; model: string }>,
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
