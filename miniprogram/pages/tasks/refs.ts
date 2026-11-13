import { request } from "../../services/request";
import { media } from "../../services/media";
import type { Row, Asset } from "../../services/types";

type RefPage = {
  destroyed?: boolean;
  data: { ongoing: { id: string; input: { assets: string[] } }[]; refs: Record<string, string> };
  setData(value: Record<string, unknown>): void;
};

// Unfinished tasks show their own first reference image. Each asset is
// looked up once per launch (the queue polls every few seconds); non-images
// and failures simply keep the status tile.
const known = new Map<string, Promise<string>>();
function assetImage(id: string) {
  if (!known.has(id))
    known.set(
      id,
      request<Row<Asset>>("/assets/" + encodeURIComponent(id))
        .then((row) => (String(row.data.type || "").startsWith("image/") ? media(row.data.url) : ""))
        .catch(() => ""),
    );
  return known.get(id) as Promise<string>;
}

export async function loadRefs(page: RefPage) {
  const wanted = page.data.ongoing.filter((j) => j.input.assets.length && !(j.id in page.data.refs));
  if (!wanted.length) return;
  const found = await Promise.all(wanted.map(async (j) => [j.id, await assetImage(j.input.assets[0])] as const));
  if (page.destroyed) return;
  page.setData({ refs: { ...page.data.refs, ...Object.fromEntries(found) } });
}
