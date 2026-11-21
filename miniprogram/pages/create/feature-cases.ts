import { request, media, error } from "../../utils/api";
import { editorAsset } from "../../utils/editor-assets";
import type { Asset, Row, Template } from "../../services/types";

// 模板案例 on 剧情带货 / 探店视频: video templates whose sample matches the
// preset's keyword (else the newest). 做同款 fills this editor instead of
// opening the template: its description, its sample picture as 图1 when the
// user has none yet (POST /templates/{id}/sample: their own copy), and its
// model, length and ratio; the user replaces the picture or edits, then
// generates here.
export type FeatureCase = { id: string; cover: string; title: string; seconds: number };
type Page = {
  data: { assets: (Row<Asset> & { isImage?: boolean })[]; busy: boolean; uploading: boolean; maxPromptChars: number; duration: number; ratio: string; caseFilling: boolean };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  loadModels?(): Promise<void>;
  refreshParameters?(): void;
};

const SIZE = 10;
const known = new Map<string, Row<Template>>(); // the cases shown, by id

async function templates(q: string) {
  const r = await request<{ items: Row<Template>[] }>(`/templates?kind=video&page=1&size=${SIZE}&q=${encodeURIComponent(q)}`, "GET", undefined, undefined, false);
  return r.items.filter((t) => t.data.cover);
}

export async function loadCases(page: Page, keyword: string) {
  if (!keyword) return;
  try {
    let rows = await templates(keyword);
    if (!rows.length) rows = await templates("");
    if (page.destroyed) return;
    rows.forEach((t) => known.set(t.id, t));
    const cases: FeatureCase[] = rows.map((t) => ({ id: t.id, cover: media(t.data.cover), title: t.data.title, seconds: t.data.duration || 0 }));
    page.setData({ featureCases: cases });
  } catch {
    // no strip: the preset works without examples
  }
}

export async function openCase(page: Page, id: string) {
  const t = known.get(id);
  if (!t || page.data.busy || page.data.uploading || page.data.caseFilling) return;
  const text = t.data.prompt || t.data.description || t.data.title;
  const prompt = Array.from(text).slice(0, page.data.maxPromptChars).join("");
  const settings = t.data.model ? { model: t.data.model, duration: t.data.duration || page.data.duration, ratio: t.data.ratio || page.data.ratio } : {};
  page.setData({ prompt, hasPrompt: !!prompt.trim(), ...settings });
  let added = false;
  if (!page.data.assets.some((a) => a.isImage)) {
    page.setData({ caseFilling: true });
    try {
      const row = await request<Row<Asset>>(`/templates/${id}/sample`, "POST");
      if (page.destroyed) return;
      page.setData({ assets: [...page.data.assets, editorAsset(row)] });
      added = true;
    } catch (e) {
      if (!(e as { status?: number }).status) error(e); // 404: a case without a picture fills only the text
    } finally {
      if (!page.destroyed) page.setData({ caseFilling: false });
    }
  }
  if (page.destroyed) return;
  if (t.data.model) void page.loadModels?.(); // picks the template's model and fits the settings
  page.refreshParameters?.();
  wx.showToast({ title: added ? "已填入同款，可替换图片或改描述" : "已填入同款描述，可修改后生成", icon: "none" });
}
