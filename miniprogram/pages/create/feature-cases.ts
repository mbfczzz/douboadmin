import { request, media, error } from "../../utils/api";
import { editorAsset } from "../../utils/editor-assets";
import { showArtFiles } from "../../utils/ui-art";
import { BUILTIN_CASES } from "./builtin-cases";
import type { BuiltinCase } from "./builtin-cases";
import type { Asset, Row, Template } from "../../services/types";

// 案例 on 剧情带货 / 探店视频: the built-in ones (builtin-cases.ts) first, then
// video templates whose sample matches the preset's keyword (else the
// newest). 做同款 fills this editor instead of opening anything: the
// description, the case's picture as 图1 (POST /cases/{id}/sample or
// /templates/{id}/sample: the user's own copy) and, for a template, its
// model, length and ratio. A picture an earlier 做同款 put in is swapped for
// the new one; a picture the user added stays.
export type FeatureCase = { id: string; cover: string; title: string; seconds: number };
type EditorAsset = Row<Asset> & { isImage?: boolean; fromCase?: boolean };
type Page = {
  data: { assets: EditorAsset[]; busy: boolean; uploading: boolean; maxPromptChars: number; duration: number; ratio: string; caseFilling: boolean };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  loadModels?(): Promise<void>;
  refreshParameters?(): void;
};

const SIZE = 10;
const known = new Map<string, Row<Template>>(); // the template cases shown, by id
const builtins = new Map<string, BuiltinCase>();

async function templates(q: string) {
  const r = await request<{ items: Row<Template>[] }>(`/templates?kind=video&page=1&size=${SIZE}&q=${encodeURIComponent(q)}`, "GET", undefined, undefined, false);
  return r.items.filter((t) => t.data.cover);
}

export async function loadCases(page: Page, feature: string, keyword: string) {
  const own = BUILTIN_CASES[feature as keyof typeof BUILTIN_CASES] || [];
  own.forEach((c) => builtins.set(c.id, c));
  let mine: FeatureCase[] = [], others: FeatureCase[] = [];
  const show = () => page.setData({ featureCases: [...mine, ...others] });
  showArtFiles(page, (url) => {
    mine = own.map((c) => ({ id: c.id, cover: url(`${c.id}-cover`), title: c.title, seconds: 0 }));
    return { featureCases: [...mine, ...others] };
  });
  if (!keyword) return;
  try {
    let rows = await templates(keyword);
    if (!rows.length && !own.length) rows = await templates("");
    if (page.destroyed) return;
    rows.forEach((t) => known.set(t.id, t));
    others = rows.map((t) => ({ id: t.id, cover: media(t.data.cover), title: t.data.title, seconds: t.data.duration || 0 }));
    show();
  } catch {
    // the built-in cases stay; the preset works without examples
  }
}

// The case's picture as the user's own 图1, replacing one an earlier case put in.
async function fillPicture(page: Page, path: string) {
  const kept = page.data.assets.filter((a) => !a.fromCase);
  if (kept.some((a) => a.isImage)) return false;
  page.setData({ caseFilling: true });
  try {
    const row = await request<Row<Asset>>(path, "POST");
    if (page.destroyed) return false;
    page.setData({ assets: [{ ...editorAsset(row), fromCase: true }, ...kept] });
    return true;
  } catch (e) {
    if (!(e as { status?: number }).status) error(e); // 404: a case without a picture fills only the text
    return false;
  } finally {
    if (!page.destroyed) page.setData({ caseFilling: false });
  }
}

export async function openCase(page: Page, id: string) {
  const own = builtins.get(id), t = known.get(id);
  if ((!own && !t) || page.data.busy || page.data.uploading || page.data.caseFilling) return;
  const text = own ? own.prompt : t!.data.prompt || t!.data.description || t!.data.title;
  const prompt = Array.from(text).slice(0, page.data.maxPromptChars).join("");
  const settings = t?.data.model ? { model: t.data.model, duration: t.data.duration || page.data.duration, ratio: t.data.ratio || page.data.ratio } : {};
  page.setData({ prompt, hasPrompt: !!prompt.trim(), ...settings });
  const added = await fillPicture(page, own ? `/cases/${id}/sample` : `/templates/${id}/sample`);
  if (page.destroyed) return;
  if (t?.data.model) void page.loadModels?.(); // picks the template's model and fits the settings
  page.refreshParameters?.();
  wx.showToast({ title: added ? "已填入同款，可替换图片或改描述" : "已填入同款描述，可修改后生成", icon: "none" });
}
