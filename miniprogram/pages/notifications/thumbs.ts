import { jobPage } from "../../services/job-pages";
import { media } from "../../services/media";

type ThumbPage = {
  destroyed?: boolean;
  data: { items: { data: { kind: string; targetId?: string } }[] };
  setData(value: Record<string, unknown>): void;
};

// Work notices show the work itself: one request for recent jobs, matched by
// id. Image jobs fall back to their result; anything unmatched stays an icon.
export async function loadThumbs(page: ThumbPage) {
  const wanted = new Set(page.data.items.filter((n) => n.data.kind !== "order" && n.data.targetId).map((n) => n.data.targetId));
  if (!wanted.size) return;
  try {
    const recent = await jobPage(1, "", 30);
    const thumbs: Record<string, string> = {};
    for (const j of recent.items) {
      const src = j.thumbnailUrl || (j.input.kind === "image" ? j.result : "");
      if (wanted.has(j.id) && src) thumbs[j.id] = media(src);
    }
    if (!page.destroyed) page.setData({ thumbs });
  } catch {
    // icons are fine
  }
}
