import { request } from "./request";
import type { Job } from "./types";

export type JobPage = {
  items: Job[];
  total: number;
  page: number;
  size: number;
};
export async function jobPage(
  page: number,
  filters = "",
  size = 20,
): Promise<JobPage> {
  const result = await request<JobPage | Job[]>(
    `/jobs?page=${page}&size=${size}${filters}`,
  );
  // Allow an older API during rolling deployments; new APIs always return pages.
  return Array.isArray(result)
    ? {
        items: result,
        total: result.length,
        page: 1,
        size: result.length || size,
      }
    : result;
}
