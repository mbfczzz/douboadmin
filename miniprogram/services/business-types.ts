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
  virtualCustom?: {
    productId: string;
    unitAmountFen: number;
    unitPointsUnits: number;
    minAmountFen: number;
    maxAmountFen: number;
  } | null;
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
    quantity?: number;
    unitFen?: number;
    purchaseMode?: string;
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
