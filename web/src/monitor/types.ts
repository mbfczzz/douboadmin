import type { Row } from "../api";
import { date } from "../api";
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
  hotConfigured: boolean;
}
export interface Event {
  message: string;
  level?: string;
  detail?: string;
  node?: string;
  acknowledged?: boolean;
  count?: number;
  lastAt?: string;
}
export interface Resource<T> {
  data?: T;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}
export const online = (node: Row<Node>) =>
  Date.now() - Date.parse(node.data.seenAt) < 60000;
export const timestamp = (value: string) => date(value, true);
// Relative time for recent events; older ones show the full timestamp.
export const ago = (value: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return timestamp(value);
};
