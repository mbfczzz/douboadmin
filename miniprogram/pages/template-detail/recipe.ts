import { loadConfig } from "../../utils/config-cache";
import { sessionToken } from "../../services/session";
import type { Asset, Model, Row, Template } from "../../services/types";
import { loadQuote } from "./quote";
import type { QuotePage } from "../../services/page-contracts";

type Choice = { id: string; name: string; resolutions: string[]; quality: string };
type Page = QuotePage & {
  data: {
    template: Row<Template> | null; assets: Row<Asset>[]; recipePositions: number[];
    recipeActiveSlot: number; recipeModel: string; recipeResolution: string; recipeModels: Choice[];
    recipeMissing: number; recipeError: string; recipeSheet: string; recipeModelIndex: number; recipeResolutionIndex: number; busy: boolean; uploading: boolean;
  };
  recipeRevision?: number; recipeOwner?: string; recipeShape?: string;
};
const resolutionRank = ["480p", "720p", "768p", "1080p", "1k", "2k", "4k"];

export function syncRecipeSlots(page: Page) {
  const slots = page.data.template?.data.imageSlots || [];
  const entries = slots.map((slot, index) => {
    const asset = page.data.assets[page.data.recipePositions.indexOf(index + 1)];
    return { ...slot, position: index + 1, id: asset?.id || "", url: asset?.data.url || "" };
  }).sort((a, b) => Number(a.optional) - Number(b.optional)); // required first (position = prompt order)
  page.setData({ recipeSlots: entries, recipeMissing: entries.filter((s) => !s.optional && !s.id).length });
}

function quote(page: Page) {
  const template = page.data.template;
  const model = page.data.recipeModels.find((m) => m.id === page.data.recipeModel);
  if (template && model) loadQuote(page, {
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
    // Same rule as the server's Template.AcceptsModel; admin model order, default preselected.
    const mode = (m: Model) => ["i2v", "keyframe"].includes(t.data.mode || "") && m.modes?.includes("omni_ref") ? "omni_ref" : t.data.mode;
    const models: Choice[] = config.models.filter(m => {
      const selected = mode(m), rules = m.referenceRules?.[selected];
      return m.kind === "video" && m.durations?.includes(t.data.duration) && m.referenceTypes?.includes("image") &&
        (!m.ratios.length || m.ratios.includes(t.data.ratio)) && (!m.modes?.length || !selected || m.modes.includes(selected)) &&
        (!rules || (rules.image?.maxCount ?? 0) >= t.data.requiredImages);
    }).map(m => ({
        id: m.id, name: m.name, quality: m.qualities?.includes(t.data.quality) ? t.data.quality : m.qualities?.[0] || "",
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

export function recipeAsset(page: Page, position: number, asset?: Row<Asset>) {
  if (!page.data.template?.data.imageSlots?.[position - 1]) return;
  if (asset && page.data.assets.some((a, i) => a.id === asset.id && page.data.recipePositions[i] !== position)) {
    wx.showToast({ title: "同一张图片不能放在不同用途位置", icon: "none" }); return;
  }
  const pairs = page.data.recipePositions.map((slot, i) => ({ slot, asset: page.data.assets[i] })).filter((p) => p.slot !== position);
  if (asset) pairs.push({ slot: position, asset });
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
    recipeAsset(this, Number(e.currentTarget.dataset.position));
  },
  openRecipeSheet(this: Page, e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.uploading || !this.data.recipeModels.length) return;
    const model = e.currentTarget.dataset.sheet === "model", d = this.data;
    this.setData({ recipeSheet: model ? "model" : "resolution", recipeChecked: model ? d.recipeModelIndex : d.recipeResolutionIndex,
      recipeOptions: model ? d.recipeModels.map((m) => m.name) : d.recipeModels.find((m) => m.id === d.recipeModel)?.resolutions || [] });
  },
  closeRecipeSheet(this: Page) { this.setData({ recipeSheet: "" }); },
  pickRecipeOption(this: Page, e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index), sheet = this.data.recipeSheet;
    this.setData({ recipeSheet: "" });
    if (this.data.busy || this.data.uploading) return;
    if (sheet === "model") { const model = this.data.recipeModels[index]; if (model) selectModel(this, model); return; }
    const model = this.data.recipeModels.find((m) => m.id === this.data.recipeModel);
    if (model?.resolutions[index]) { this.setData({ recipeResolution: model.resolutions[index], recipeResolutionIndex: index }); quote(this); }
  },
};
