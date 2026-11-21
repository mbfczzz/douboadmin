import { error } from "../../utils/api";
import { writeScript } from "../../services/ai-script";
import { loadConfig } from "../../utils/config-cache";
import { remakeInstruction } from "./remake-brief";
import { loadCases, openCase } from "./feature-cases";
import { ID_OPTIONS, idPrompt, loadIdCases, applyIdCase } from "./id-photo";
import type { Option } from "./id-photo";
import { REMAKE_SOURCE_KEY } from "../../services/hot-import";
import type { RemakeSource } from "../../services/hot-import";
import { defaultPromptChars } from "./models";
import { referenceSettings } from "./references";
import type { Model } from "../../services/types";
import type { VisibleEditor } from "./editor-types";

// Feature presets opened from the 创作 page (剧情带货, 探店视频, AI证件照) and
// from 一键复刻 (the original video arrives as a draft reference). They are
// this editor with a fixed kind, their own title and hints, plus "AI写剧本"
// (video) or option chips that write the prompt (证件照). Upload, models,
// pricing and generation stay the editor's own.
// upload: the big picture entry's label; cases: the keyword its 模板案例 match;
// least: references of its kind it needs (1 when `needs` is set).
type Feature = { title: string; kind: "video" | "image"; placeholder: string; tip: string; script?: string; ratio?: string; options?: Option[]; uses?: "image" | "video"; needs?: string; least?: number; upload?: string; cases?: string };


export const FEATURES: Record<string, Feature> = {
  ad: { title: "剧情带货", kind: "video", uses: "image", upload: "上传商品图", cases: "带货", script: "剧情带货短视频", tip: "建议上传清晰完整的商品图", placeholder: "描述剧情或商品卖点，\n也可以写个想法，点「AI写剧本」。" },
  shop: { title: "探店视频", kind: "video", uses: "image", upload: "上传门店图", cases: "探店", script: "探店打卡短视频", tip: "按描述顺序上传门店、菜品图", placeholder: "介绍门店和想拍的画面，\n例如：拍一个女生在我的奶茶店打卡。" },
  idphoto: { title: "AI证件照", kind: "image", ratio: "3:4", uses: "image", upload: "上传照片", needs: "请先上传一张本人照片", options: ID_OPTIONS, tip: "上传一张正脸清晰的照片", placeholder: "选好背景和服装后自动生成描述，也可以修改。" },
  // From AI试衣 (pages/tryon): @图片1 the person, @图片2 the outfit, prompt written there.
  tryon: { title: "AI试衣", kind: "image", ratio: "3:4", uses: "image", least: 2, needs: "请放入人物照片和服装图各一张", tip: "@图片1 是人物，@图片2 是服装", placeholder: "描述试穿效果，例如保留原背景、换成全身照。" },
  remake: { title: "一键复刻", kind: "video", uses: "video", needs: "请先带入要复刻的视频", script: "同款复刻短视频", tip: "已带入无水印原视频作为参考", placeholder: "描述想怎么复刻，例如换成自己的产品或人物。" },
};


type Page = VisibleEditor & { data: VisibleEditor["data"] & { feature: string; featureChoice: Record<string, number>; scriptBusy: boolean; remakeSource: RemakeSource | null } };

// Opening the 一键复刻 preset writes the detailed description once (quietly
// skipped when no chat model is offered; AI写剧本 then says so on tap).
export async function startFeatureScript(page: Page) {
  if (page.data.feature !== "remake") return;
  const source = wx.getStorageSync(REMAKE_SOURCE_KEY) as RemakeSource | "";
  if (!source) return;
  wx.removeStorageSync(REMAKE_SOURCE_KEY);
  page.setData({ remakeSource: source });
  const config = await loadConfig().catch(() => null);
  if (config?.models.some((m) => m.kind === "chat") && !page.destroyed) await featureHandlers.aiScript.call(page);
}


export function applyFeature(page: Page, key: string) {
  const f = FEATURES[key];
  if (!f) return;
  const choice = { bg: 0, dress: 0, size: 0 };
  const prompt = f.options ? idPrompt(choice) : "";
  page.setData({
    feature: key, featureTitle: f.title, featureTip: f.tip, featurePlaceholder: f.placeholder,
    featureScript: !!f.script, featureOptions: f.options || [], featureChoice: choice, featureUpload: f.upload || "",
    kind: f.kind, maxPromptChars: defaultPromptChars(f.kind), ratio: f.ratio || (f.kind === "image" ? "1:1" : "9:16"),
    prompt, hasPrompt: !!prompt,
  });
  if (key === "idphoto") loadIdCases(page); // finished examples (id-photo.ts)
  else void loadCases(page, key, f.cases || "");
}

// Presets work from references: start on a model that takes their kind.
export function featureModel<T extends Model>(list: T[], feature: string) {
  const f = FEATURES[feature];
  if (!f?.uses) return undefined;
  const takes = (m: T) => (f.uses === "video" ? referenceSettings(m).allowVideo : referenceSettings(m).allowImage);
  // AI试衣 sends two pictures: a model that takes both, else the first that takes pictures.
  return list.find((m) => takes(m) && referenceSettings(m).maxReferences >= (f.least || 1)) || list.find(takes);
}

// A preset that works from a photo (or the remade video) cannot start without it.
export function featureProblem(data: { feature: string; assets: { isImage?: boolean; isVideo?: boolean }[] }) {
  const f = FEATURES[data.feature];
  if (!f?.needs) return "";
  const count = data.assets.filter((a) => (f.uses === "video" ? a.isVideo : a.isImage)).length;
  return count >= (f.least || 1) ? "" : f.needs;
}

export const featureHandlers = {
  openCase(this: Page, e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (applyIdCase(this, id)) return;
    return openCase(this, id);
  },
  clearPrompt(this: Page) {
    if (!this.data.busy && !this.data.scriptBusy) this.setData({ prompt: "", hasPrompt: false });
  },
  chooseOption(this: Page, e: WechatMiniprogram.TouchEvent) {
    const { key, index } = e.currentTarget.dataset as { key: string; index: number };
    if (this.data.busy) return;
    const featureChoice = { ...this.data.featureChoice, [key]: Number(index) };
    const prompt = idPrompt(featureChoice);
    this.setData({ featureChoice, prompt, hasPrompt: true });
  },
  async aiScript(this: Page) {
    const f = FEATURES[this.data.feature];
    if (!f?.script || this.data.scriptBusy || this.data.busy) return;
    const count = (video: boolean) => this.data.assets.filter((a) => (video ? a.isVideo : a.isImage)).length;
    const images = count(false), videos = count(true);
    const refs = (images ? `用户上传了 ${images} 张参考图，用 @图片1…@图片${images} 指代并写进画面里。` : "") + (videos ? `参考视频用 @视频1…@视频${videos} 指代，沿用它的镜头和节奏。` : "");
    const idea = this.data.prompt.trim() || "（未填写，请根据参考图自由发挥）";
    const limit = Math.min(this.data.maxPromptChars, 500);
    const source = this.data.feature === "remake" ? this.data.remakeSource : null;
    const instruction = source ? remakeInstruction(source, this.data.duration || 5, limit) : `你是短视频编剧。为一条 ${this.data.duration || 5} 秒的${f.script}写一段可直接用于 AI 视频生成的画面描述：按时间顺序写清场景、人物动作、镜头运动和要展示的重点，不超过 ${limit} 字。${refs}只输出画面描述本身，不要标题和解释。\n用户的想法：${idea}`;
    this.setData({ scriptBusy: true });
    try {
      const script = await writeScript(instruction, () => this.visible && !this.destroyed);
      if (script && !this.destroyed) {
        const prompt = Array.from(script).slice(0, this.data.maxPromptChars).join("");
        this.setData({ prompt, hasPrompt: true });
      }
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ scriptBusy: false });
    }
  },
};
