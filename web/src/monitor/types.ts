import type { Row } from "../api";
export interface Node {
  host: string;
  role: string;
  seenAt: string;
  heapBytes: number;
  goroutines: number;
  dbOpen: number;
  dbInUse: number;
  goVersion: string;
}
export interface Health {
  instances: Row<Node>[];
  queue: { queued: number; running: number; failedHour: number };
  database: boolean;
  redisConfigured: boolean;
  ossConfigured: boolean;
  relayConfigured: boolean;
  paymentConfigured: boolean;
  mixConfigured: boolean;
  hotConfigured: boolean;
}
export interface Event {
  message: string;
  level?: string;
  detail?: string;
  node?: string;
  acknowledged?: boolean;
}
export interface Resource<T> {
  data?: T;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}
export const online = (node: Row<Node>) =>
  Date.now() - Date.parse(node.data.seenAt) < 60000;
export const timestamp = (value: string) =>
  new Date(value).toLocaleString("zh-CN");
