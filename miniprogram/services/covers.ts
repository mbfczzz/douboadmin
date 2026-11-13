import { request } from "./request";
import { media } from "./media";
import type { Row, Template } from "./types";

export type Cover = { id: string; cover: string; title: string; length: string };

// Real template covers (already on OSS), loaded once per launch and shared by
// empty states, the create strip and decorative art on finance pages.
let cached: Promise<Cover[]> | undefined;
export function templateCovers() {
  // Plain assignment, not "??=": WeChat's compiler does not reliably accept
  // ES2021 logical assignment and a parse error here stops the app starting.
  if (!cached) cached = request<{ items: Row<Template>[] }>("/templates?kind=video&page=1&size=6", "GET", undefined, undefined, false)
    .then((r) => r.items.filter((t) => t.data.cover).map((t) => ({ id: t.id, cover: media(t.data.cover), title: t.data.title, length: t.data.duration > 0 ? t.data.duration + "秒" : "" })))
    .catch(() => {
      cached = undefined; // try again next time
      return [];
    });
  return cached;
}
