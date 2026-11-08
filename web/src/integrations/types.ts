export interface IntegrationField {
  key: string;
  label: string;
  kind:
    | "text"
    | "secret"
    | "url"
    | "origins"
    | "select"
    | "bool"
    | "products"
    | "product"
    | "mapping";
  hint?: string;
  options?: { value: string; label: string }[];
  columns?: {
    key: string;
    label: string;
    max: number;
    pattern?: string;
    scale?: number;
  }[];
  limit?: number;
}
export interface IntegrationGroup {
  id: string;
  name: string;
  hint: string;
  fields: IntegrationField[];
  values: Record<string, string>;
  secrets: Record<string, boolean>;
  version: number;
  appliedVersion: number;
  source: "environment" | "database";
  pendingRestart: boolean;
  validation?: string;
}
export interface IntegrationState {
  canManage: boolean;
  available?: boolean;
  keyFile?: string;
  groups?: IntegrationGroup[];
}
export interface Product {
  id: string;
  name: string;
  amountFen: number;
  pointsUnits: number;
}
export function products(raw: string): Product[] {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
