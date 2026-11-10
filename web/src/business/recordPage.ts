import type { Row } from "../api";

export type RecordPage<T> = {
  items: Row<T>[];
  page: number;
  size: number;
  total: number;
};
