import { request } from "./request";
import { media } from "./media";
import { resultImages } from "./result-images";

export interface FeaturedWork {
  id: string;
  title: string;
  kind: "image" | "video";
  result: string;
  results?: string[];
  thumbnailUrl?: string;
  createdAt: string;
}
export interface FeaturedPage { items: FeaturedWork[]; total: number; page: number; size: number }
export function featuredView(work: FeaturedWork): FeaturedWork {
  return { ...work, result: media(work.result),
    thumbnailUrl: work.thumbnailUrl ? media(work.thumbnailUrl) : "",
    results: work.kind === "image" ? resultImages(work) : [] };
}
export async function featuredPage(page: number, kind: string) {
  const result = await request<FeaturedPage>(`/featured-works?page=${page}&size=20&kind=${encodeURIComponent(kind)}`, "GET", undefined, undefined, false);
  return { ...result, items: result.items.map(featuredView) };
}
export async function featuredDetail(id: string) {
  return featuredView(await request<FeaturedWork>(`/featured-works/${encodeURIComponent(id)}`, "GET", undefined, undefined, false));
}
