import type { walletData } from "../pages/wallet/state";
import type { mixState } from "../pages/mix/state";
import type { registerState } from "../pages/activate/register";
import type { AccessStatus } from "./access-types";
type Fields = typeof registerState;

export interface WalletEditor {
  data: typeof walletData;
  destroyed: boolean;
  checkoutToken: string;
  setData(value: Record<string, unknown>): void;
  trackPayment(id: string): void;
  load(): Promise<void>;
}

export interface MixEditor {
  data: typeof mixState;
  assetRevision: number;
  revision: number;
  setData(data: Record<string, unknown>): void;
}

export interface AvatarEditor {
  data: { busy: boolean; uploadingAvatar: boolean };
  revision: number;
  ownerToken: string;
  setData(data: Record<string, unknown>): void;
  current(revision: number): boolean;
  updateDirty(): void;
}

export interface QuotePage {
  destroyed: boolean;
  quoteAbort?: () => void;
  setData(value: Record<string, unknown>): void;
}

export type MenuPage = {
  visible: boolean;
  data: { showModels: boolean; expanded: boolean; availableModels: unknown[] };
  setData: (value: Record<string, unknown>) => void;
};

export interface Register {
  owner: string;
  data: Fields & { busy: boolean; status: AccessStatus | null };
  setData(data: Partial<Fields> & Record<string, unknown>): void;
  destroyed: boolean;
  timer?: number;
  load(): Promise<void>;
}

export interface MotionPage {
  route?: string;
  data: Record<string, unknown>;
  setData(data: Record<string, unknown>): void;
}

export interface AssetEditor {
  assetRevision: number;
  restoreIds: string[];
  setData(data: Record<string, unknown>): void;
}

export interface PagedView {
  data: { page: number; total: number; loading: boolean };
  fetching?: boolean;
  setData(value: Record<string, unknown>): void;
  load(): Promise<void>;
}
