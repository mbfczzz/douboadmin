import { request, media, error } from "../../utils/api";

// The 服装 and 收藏 tabs of AI试衣: the clothing library a page at a time
// (by category and order), 随机一个, and favourites kept on the phone
// (ids only; 收藏 reads those outfits again so pictures stay signed).
export type Outfit = { id: string; title: string; category: string; description: string; image: string };
type Category = { name: string; count: number };
type Reply = { items: Outfit[]; total: number };

export const SORTS = [
  { key: "", label: "默认排序" },
  { key: "newest", label: "最新上架" },
];
const SIZE = 20;
// Picture addresses are signed for 30 minutes (handed out with at least 10
// left); a list older than this gets fresh ones before more is shown.
export const FRESH_MS = 10 * 60 * 1000;
const FAVORITES = "tryon-favorites";
const MAX_FAVORITES = 100;

export type GalleryPage = {
  data: {
    category: string; sort: string; outfits: Outfit[]; total: number; galleryLoading: boolean; galleryError: string;
    favored: Record<string, boolean>; favorites: Outfit[]; favoritesLoading: boolean; preview: Outfit | null; randomBusy: boolean;
  };
  galleryRevision: number;
  galleryPage: number;
  galleryAt: number;
  favoritesRevision: number;
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

const shown = (o: Outfit): Outfit => ({ ...o, image: o.image ? media(o.image) : "" });

export function favoriteIds(): string[] {
  const v = wx.getStorageSync(FAVORITES);
  return Array.isArray(v) ? v.filter((id) => typeof id === "string").slice(0, MAX_FAVORITES) : [];
}
function saveFavorites(page: GalleryPage, ids: string[]) {
  wx.setStorageSync(FAVORITES, ids);
  const favored: Record<string, boolean> = {};
  for (const id of ids) favored[id] = true;
  page.setData({ favored });
}

export async function loadCategories(page: GalleryPage) {
  try {
    const list = await request<Category[]>("/outfits/categories");
    if (!page.destroyed) page.setData({ categories: list, allCount: list.reduce((n, c) => n + c.count, 0) });
  } catch {
    // the chips are a filter; 全部 still lists everything
  }
}

// A first page (category or order changed) or the next one.
export async function loadOutfits(page: GalleryPage, more = false) {
  const d = page.data;
  if (more && (d.galleryLoading || d.galleryError || d.outfits.length >= d.total)) return;
  const revision = ++page.galleryRevision;
  const next = more ? page.galleryPage + 1 : 1;
  page.setData(more ? { galleryLoading: true } : { galleryLoading: true, galleryError: "", outfits: [], total: 0 });
  try {
    const q = `/outfits?page=${next}&size=${SIZE}&sort=${d.sort}&category=${encodeURIComponent(d.category)}`;
    const r = await request<Reply>(q);
    if (revision !== page.galleryRevision || page.destroyed) return;
    page.galleryPage = next;
    if (!more) page.galleryAt = Date.now();
    const seen = new Set(more ? page.data.outfits.map((o) => o.id) : []);
    const fresh = r.items.filter((o) => !seen.has(o.id)).map(shown);
    page.setData({ outfits: more ? [...page.data.outfits, ...fresh] : fresh, total: r.total });
  } catch (e) {
    if (revision === page.galleryRevision && !page.destroyed) page.setData({ galleryError: (e as Error)?.message || "服装读取失败" });
  } finally {
    if (revision === page.galleryRevision && !page.destroyed) page.setData({ galleryLoading: false });
  }
}

// 收藏, in the order they were favoured; outfits taken down drop out.
export async function loadFavorites(page: GalleryPage) {
  const ids = favoriteIds();
  if (!ids.length) {
    page.setData({ favorites: [], favoritesLoading: false });
    return;
  }
  const revision = ++page.favoritesRevision;
  page.setData({ favoritesLoading: true });
  try {
    const r = await request<Reply>(`/outfits?page=1&size=${MAX_FAVORITES}&ids=${ids.map(encodeURIComponent).join(",")}`);
    if (page.destroyed || revision !== page.favoritesRevision) return;
    const byId = new Map(r.items.map((o) => [o.id, shown(o)]));
    const kept = ids.filter((id) => byId.has(id));
    if (kept.length !== ids.length) saveFavorites(page, kept);
    page.setData({ favorites: kept.map((id) => byId.get(id)) });
  } catch (e) {
    if (!page.destroyed && revision === page.favoritesRevision) error(e);
  } finally {
    if (!page.destroyed && revision === page.favoritesRevision) page.setData({ favoritesLoading: false });
  }
}

// The shown list with fresh picture addresses, in place (the scroll stays).
export async function refreshPictures(page: GalleryPage) {
  const d = page.data;
  if (d.galleryLoading || !d.outfits.length || Date.now() - page.galleryAt < FRESH_MS) return;
  const revision = ++page.galleryRevision;
  page.setData({ galleryLoading: true });
  try {
    const fresh = new Map<string, string>();
    for (let p = 1; (p - 1) * 100 < d.outfits.length; p++) {
      const r = await request<Reply>(`/outfits?page=${p}&size=100&sort=${d.sort}&category=${encodeURIComponent(d.category)}`);
      for (const o of r.items) fresh.set(o.id, shown(o).image);
    }
    if (revision !== page.galleryRevision || page.destroyed) return;
    page.galleryAt = Date.now();
    // Taken-down outfits keep their place until the list is read again.
    page.setData({ outfits: page.data.outfits.map((o) => ({ ...o, image: fresh.get(o.id) || o.image })) });
  } catch {
    // the old addresses stay; the next visit tries again
  } finally {
    if (revision === page.galleryRevision && !page.destroyed) page.setData({ galleryLoading: false });
  }
}

export function toggleFavorite(page: GalleryPage, outfit: Outfit) {
  const ids = favoriteIds();
  const on = ids.includes(outfit.id);
  const next = on ? ids.filter((id) => id !== outfit.id) : [outfit.id, ...ids].slice(0, MAX_FAVORITES);
  saveFavorites(page, next);
  const favorites = page.data.favorites.filter((o) => o.id !== outfit.id);
  page.setData({ favorites: on ? favorites : [outfit, ...favorites] });
  wx.showToast({ title: on ? "已取消收藏" : "已收藏", icon: "none" });
}

export function initFavorites(page: GalleryPage) {
  saveFavorites(page, favoriteIds());
}

// 随机一个 within the chosen category, shown in the preview.
export async function randomOutfit(page: GalleryPage) {
  if (page.data.randomBusy) return;
  page.setData({ randomBusy: true });
  try {
    const o = await request<Outfit>(`/outfits/random?category=${encodeURIComponent(page.data.category)}`);
    if (!page.destroyed) page.setData({ preview: shown(o) });
  } catch (e) {
    if (!page.destroyed) error(e);
  } finally {
    if (!page.destroyed) page.setData({ randomBusy: false });
  }
}
