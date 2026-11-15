import { media } from "./media";

export function resultImages(work: { result?: string; results?: string[]; deleted?: boolean }) {
  if (work.deleted) return [];
  const values = work.results?.length ? work.results : work.result ? [work.result] : [];
  return [...new Set(values.filter((url) => typeof url === "string" && !!url).map(media))];
}
