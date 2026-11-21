import { enterPage } from "../../utils/api";
import { showArt } from "../../utils/ui-art";
import { SORTS, loadCategories, loadOutfits, loadFavorites, toggleFavorite, initFavorites, randomOutfit, refreshPictures } from "./gallery";
import { fittingHandlers, wearOutfit } from "./fitting";
import type { Outfit } from "./gallery";
import type { Person, Garment } from "./fitting";

// AI试衣 (创作 → AI试衣): 服装 browses the clothing library, 试穿 puts a
// photo of the person and an outfit together, 收藏 keeps liked outfits.
// Tapping an outfit previews it; 试穿这件 takes it to 试穿.
Page({
  ...fittingHandlers,
  data: {
    tab: "gallery",
    tabs: [
      { key: "gallery", label: "服装", icon: "image", art: "gallery" },
      { key: "fit", label: "试穿", icon: "user", art: "fit" },
      { key: "favorites", label: "收藏", icon: "heart", art: "fav" },
    ],
    categories: [] as { name: string; count: number; image?: string }[],
    allCount: 0,
    category: "",
    sort: "",
    sortLabel: SORTS[0].label,
    outfits: [] as Outfit[],
    total: 0,
    galleryLoading: true,
    galleryError: "",
    randomBusy: false,
    favored: {} as Record<string, boolean>,
    favorites: [] as Outfit[],
    favoritesLoading: false,
    preview: null as Outfit | null,
    person: null as Person | null,
    garment: null as Garment | null,
    personBusy: false,
    garmentBusy: false,
    keepBackground: true,
    starting: false,
    // Codex pictures (media/ui-art/tryon-*); each spot keeps its icon until one arrives.
    art: {} as Record<string, string>,
  },
  galleryRevision: 0,
  galleryPage: 1,
  galleryAt: 0,
  favoritesRevision: 0,
  destroyed: false,
  loaded: false,
  onLoad() {
    initFavorites(this);
  },
  onShow() {
    enterPage(this);
    showArt(this, (a) => ({
      art: {
        gallery: a.tryonGallery, fit: a.tryonFit, fav: a.tryonFav, all: a.tryonAll, dice: a.tryonDice, upload: a.tryonUpload,
        keepBg: a.tryonKeepBg, person: a.tryonPerson, outfit: a.tryonOutfit, emptyFav: a.tryonEmptyFav, emptyRack: a.tryonEmptyRack,
      },
    }));
    if (this.loaded) {
      void refreshPictures(this);
      return;
    }
    this.loaded = true;
    void loadCategories(this);
    void loadOutfits(this);
  },
  onUnload() {
    this.destroyed = true;
    this.galleryRevision++;
  },
  onReachBottom() {
    // Old addresses first (when due), then the next page.
    if (this.data.tab === "gallery") void refreshPictures(this).then(() => loadOutfits(this, true));
  },
  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.key as string;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === "favorites") void loadFavorites(this);
    if (tab === "gallery") void refreshPictures(this);
  },
  chooseCategory(e: WechatMiniprogram.TouchEvent) {
    const category = e.currentTarget.dataset.name as string;
    if (category === this.data.category) return;
    this.setData({ category });
    void loadOutfits(this);
  },
  async chooseSort() {
    try {
      const { tapIndex } = await wx.showActionSheet({ itemList: SORTS.map((s) => s.label) });
      const s = SORTS[tapIndex];
      if (!s || s.key === this.data.sort) return;
      this.setData({ sort: s.key, sortLabel: s.label });
      void loadOutfits(this);
    } catch {
      // closed without choosing
    }
  },
  retryGallery() {
    void loadOutfits(this);
  },
  random() {
    void randomOutfit(this);
  },
  outfitOf(e: WechatMiniprogram.TouchEvent): Outfit | undefined {
    const id = e.currentTarget.dataset.id as string;
    const d = this.data;
    return [d.preview, ...d.outfits, ...d.favorites].find((o) => o?.id === id) || undefined;
  },
  openPreview(e: WechatMiniprogram.TouchEvent) {
    const o = this.outfitOf(e);
    if (o) this.setData({ preview: o });
  },
  closePreview() {
    this.setData({ preview: null });
  },
  favorite(e: WechatMiniprogram.TouchEvent) {
    const o = this.outfitOf(e);
    if (o) toggleFavorite(this, o);
  },
  wear(e: WechatMiniprogram.TouchEvent) {
    const o = this.outfitOf(e);
    if (o && !this.data.starting) wearOutfit(this, o);
  },
  // 从库中选 on 试穿 goes back to the library.
  browse() {
    this.setData({ tab: "gallery" });
  },
  noop() {},
});
