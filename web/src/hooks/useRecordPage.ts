import { useResource } from "./useResource";
import type { Row } from "../api";
export interface RecordPage<T> {
  items: Row<T>[];
  total: number;
  page: number;
  size: number;
}
export function useRecordPage<T>(
  path: string,
  page: number,
  size = 20,
  pollMs = 0,
) {
  const result = useResource<RecordPage<T> | Row<T>[]>(
    `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=${size}`,
    pollMs,
  );
  const data = Array.isArray(result.data)
    ? { items: result.data, total: result.data.length, page, size }
    : result.data;
  return { ...result, data };
}
