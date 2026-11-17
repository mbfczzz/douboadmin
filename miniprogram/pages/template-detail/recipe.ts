import { loadConfig } from "../../utils/config-cache";
import { sessionToken } from "../../services/session";
import type { Asset, Model, Row, Template } from "../../services/types";
import { loadQuote } from "./quote";

type Choice = { id: string; name: string; resolutions: string[]; quality: string };
type Page = {
  data: {
    template: Row<Template> | null; assets: Row<Asset>[]; recipePositions: number[];
    recipeActiveSlot: number; recipeModel: string; recipeResolution: string; recipeModels: Choice[];
    recipeMissing: number; recipeError: string; busy: boolean; uploading: boolean;
  };
  recipeRevision?: number; recipeOwner?: string; recipeShape?: string;
  destroyed: boolean; setData(value: Record<string, unknown>): void;
};
const resolutionRank = ["480p", "720p", "768p", "1080p", "1k", "2k", "4k"];

export function syncRecipeSlots(page: Page) {
  const slots = page.data.template?.data.imageSlots || [];
  const entries = slots.map((slot, index) => {
    const asset = page.data.assets[page.data.recipePositions.indexOf(index + 1)];
    return { ...slot, position: index + 1, id: asset?.id || "", url: asset?.data.url || "" };
  });
  page.setData({ recipeSlots: entries, recipeMissing: entries.filter((s) => !s.optional && !s.id).length });
}

function quote(page: Page) {
  const template = page.data.template;
  const model = page.data.recipeModels.find((m) => m.id === page.data.recipeModel);
  if (template && model) loadQuote(page as Parameters<typeof loadQuote>[0], {
    ...template, data: { ...template.data, model: model.id, resolution: page.data.recipeResolution, quality: model.quality },
  });
}

function selectModel(page: Page, model: Choice) {
  const current = page.data.recipeModel === model.id ? page.data.recipeResolution : page.data.template?.data.resolution;
  const resolution = model.resolutions.includes(current || "") ? current! : model.resolutions.find((r) => r.toLowerCase() === "720p") || model.resolutions[0] || "";
  page.setData({ recipeModel: model.id, recipeModelIndex: page.data.recipeModels.indexOf(model), recipeResolution: resolution,
    recipeQuality: model.quality, recipeResolutions: model.resolutions, recipeResolutionIndex: Math.max(0, model.resolutions.indexOf(resolution)), recipeError: "" });
  quote(page);
}

export async function loadRecipe(page: Page) {
  const t = page.data.template;
  if (!t?.data.imageSlots?.length) return;
  const owner = sessionToken();
  const shape = JSON.stringify([t.id, t.data.imageSlots]);
  if (page.recipeOwner !== owner || page.recipeShape !== shape) page.setData({ assets: [], recipePositions: [] });
  page.recipeOwner = owner; page.recipeShape = shape;
  syncRecipeSlots(page);
  const version = (page.recipeRevision || 0) + 1;
  page.recipeRevision = version;
  page.setData({ recipeError: "正在读取可用模型…", quoteText: "" });
  try {
    const config = await loadConfig();
    if (page.destroyed || page.recipeRevision !== version || owner !== sessionToken() || page.data.template?.id !== t.id) return;
    const allowed = [t.data.model, ...(t.data.selectableModels || [])];
    const models: Choice[] = config.models.filter((m: Model) => allowed.includes(m.id) && m.kind === "video" &&
      m.durations?.includes(t.data.duration) && (!m.ratios.length || m.ratios.includes(t.data.ratio)) &&
      (!m.modes?.length || m.modes.includes(t.data.mode))).map((m: Model) => ({
        id: m.id, name: m.name, quality: t.data.quality || m.qualities?.[0] || "",
        resolutions: [...m.resolutions].sort((a, b) => resolutionRank.indexOf(a.toLowerCase()) - resolutionRank.indexOf(b.toLowerCase())),
      }));
    page.setData({ recipeModels: models });
    const model = models.find((m) => m.id === page.data.recipeModel) || models.find((m) => m.id === t.data.model) || models[0];
    if (!model) { page.setData({ recipeError: "暂无兼容当前模板参数的可用模型，请联系管理员" }); return; }
    selectModel(page, model);
  } catch {
    if (!page.destroyed && version === page.recipeRevision) page.setData({ recipeError: "模型读取失败，请重新打开模板重试" });
  }
}

export function recipeAsset(page: Page, position: number, asset: Row<Asset>) {
  if (!page.data.template?.data.imageSlots?.[position - 1]) return;
  if (page.data.assets.some((a, i) => a.id === asset.id && page.data.recipePositions[i] !== position)) {
    wx.showToast({ title: "同一张图片不能放在不同用途位置", icon: "none" }); return;
  }
  const pairs = page.data.recipePositions.map((slot, i) => ({ slot, asset: page.data.assets[i] })).filter((p) => p.slot !== position);
  pairs.push({ slot: position, asset });
  pairs.sort((a, b) => a.slot - b.slot);
  page.setData({ assets: pairs.map((p) => p.asset), recipePositions: pairs.map((p) => p.slot) });
  syncRecipeSlots(page);
}

export const recipeHandlers = {
  chooseRecipeSlot(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (!this.data.busy && !this.data.uploading) this.setData({ recipeActiveSlot: Number(e.currentTarget.dataset.position), sourceOpen: true });
  },
  removeRecipeSlot(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.uploading) return;
    const keep = this.data.recipePositions.map((slot, i) => ({ slot, asset: this.data.assets[i] })).filter((p) => p.slot !== Number(e.currentTarget.dataset.position));
    this.setData({ assets: keep.map((p) => p.asset), recipePositions: keep.map((p) => p.slot) });
    syncRecipeSlots(this);
  },
  chooseRecipeModel(this: Page, e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    if (this.data.busy || this.data.uploading) return;
    const model = this.data.recipeModels[Number(e.detail.value)];
    if (model) selectModel(this, model);
  },
  chooseRecipeResolution(this: Page, e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    if (this.data.busy || this.data.uploading) return;
    const index = Number(e.detail.value);
    const model = this.data.recipeModels.find((m) => m.id === this.data.recipeModel);
    if (model?.resolutions[index]) { this.setData({ recipeResolution: model.resolutions[index], recipeResolutionIndex: index }); quote(this); }
  },
};
