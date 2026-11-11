import type { creationData } from "./state";
import type { Model } from "../../services/types";

export type ModelChoice = Model & {
  label: string;
  description: string;
  estimate: string;
  iconURL: string;
  badges: { text: string; tone: string; id: string }[];
};

export interface ReferenceEditor {
  refreshParameters?(): void;
  data: typeof creationData;
  assetRevision: number;
  setData(data: Record<string, unknown>): void;
}
export interface VisibleEditor {
  data: typeof creationData;
  visible: boolean;
  destroyed: boolean;
  setData(value: Record<string, unknown>): void;
}
export type SubmitEditor = VisibleEditor & ReferenceEditor;
export interface EstimateTicket {
  key: string;
  at: number;
  timer?: ReturnType<typeof setTimeout>;
  abort?: () => void;
}
