import type { Me } from "../../services/types";
import type { profileState } from "./form";

export interface ProfileEditor {
  data: typeof profileState & { me: Me | null };
  revision: number;
  editVersion: number;
  ownerToken: string;
  baseline: string;
  saved: boolean;
  visible: boolean;
  setData(data: Record<string, unknown>): void;
  current(revision: number): boolean;
  updateDirty(): void;
  load(): Promise<void>;
  leave(): Promise<void>;
}

