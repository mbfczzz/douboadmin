import { error } from "../../utils/api";
import { writeScript } from "../../services/ai-script";
import { defaultPromptChars } from "./models";
import { referenceSettings } from "./references";
import type { Model } from "../../services/types";
import type { VisibleEditor } from "./editor-types";

// Feature presets opened from the 创作 page (剧情带货, 探店视频, AI证件照) and
// from 一键复刻 (the original video arrives as a draft reference). They are
// this editor with a fixed kind, their own title and hints, plus "AI写剧本"
// (video) or option chips that write the prompt (证件照). Upload, models,
// pricing and generation stay the editor's own.
type Choice = { label: string; text: string };
type Option = { key: string; label: string; values: Choice[] };
type Feature = { title: string; kind: "video" | "image"; placeholder: string; tip: string; script?: string; ratio?: string; options?: Option[]; uses?: "image" | "video"; needs?: string };

const ID_OPTIONS: Option[] = [
  { key: "bg", label: "背景", values: [{ label: "白底", text: "白色" }, { label: "蓝底", text: "蓝色" }, { label: "红底", text: "红色" }] },
  { key: "dress", label: "服装", values: [{ label: "原服装", text: "保留原来的服装" }, { label: "正装西服", text: "换成深色正装西服配白衬衫" }, { label: "白衬衫", text: "换成白色衬衫" }] },
];

export const FEATURES: Record<string, Feature> = {
  ad: { title: "剧情带货", kind: "video", uses: "image", script: "剧情带货短视频", tip: "建议上传清晰完整的商品图", placeholder: "描述剧情或商品卖点，\n也可以写个想法，点「AI写剧本」。" },
  shop: { title: "探店视频", kind: "video", uses: "image", script: "探店打卡短视频", tip: "按描述顺序上传门店、菜品图", placeholder: "介绍门店和想拍的画面，\n例如：拍一个女生在我的奶茶店打卡。" },
  idphoto: { title: "AI证件照", kind: "image", ratio: "3:4", uses: "image", needs: "请先上传一张本人照片", options: ID_OPTIONS, tip: "上传一张正脸清晰的照片", placeholder: "选好背景和服装后自动生成描述，也可以修改。" },
  remake: { title: "一键复刻", kind: "video", uses: "video", needs: "请先带入要复刻的视频", script: "同款复刻短视频", tip: "已带入无水印原视频作为参考", placeholder: "描述想怎么复刻，例如换成自己的产品或人物。" },
};

type Page = VisibleEditor & { data: VisibleEditor["data"] & { feature: string; featureChoice: Record<string, number>; scriptBusy: boolean } };

function idPrompt(choice: Record<string, number>) {
  const pick = (o: Option) => o.values[choice[o.key] || 0].text;
  return `将@图片1中的人物生成标准证件照：正面免冠，五官清晰，表情自然，光线均匀，${pick(ID_OPTIONS[0])}纯色背景，${pick(ID_OPTIONS[1])}，头肩构图，保持本人长相不变。`;
}

export function applyFeature(page: Page, key: string) {
  const f = FEATURES[key];
  if (!f) return;
  const choice = { bg: 0, dress: 0 };
  const prompt = f.options ? idPrompt(choice) : "";
  page.setData({
    feature: key, featureTitle: f.title, featureTip: f.tip, featurePlaceholder: f.placeholder,
    featureScript: !!f.script, featureOptions: f.options || [], featureChoice: choice,
    kind: f.kind, maxPromptChars: defaultPromptChars(f.kind), ratio: f.ratio || (f.kind === "image" ? "1:1" : "9:16"),
    prompt, hasPrompt: !!prompt,
  });
}

// Presets work from references: start on a model that takes their kind.
export function featureModel<T extends Model>(list: T[], feature: string) {
  const uses = FEATURES[feature]?.uses;
  if (!uses) return undefined;
  return list.find((m) => (uses === "video" ? referenceSettings(m).allowVideo : referenceSettings(m).allowImage));
}

// A preset that works from a photo (or the remade video) cannot start without it.
export function featureProblem(data: { feature: string; assets: { isImage?: boolean; isVideo?: boolean }[] }) {
  const f = FEATURES[data.feature];
  if (!f?.needs) return "";
  return data.assets.some((a) => (f.uses === "video" ? a.isVideo : a.isImage)) ? "" : f.needs;
}

export const featureHandlers = {
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
    const instruction = `你是短视频编剧。为一条 ${this.data.duration || 5} 秒的${f.script}写一段可直接用于 AI 视频生成的画面描述：按时间顺序写清场景、人物动作、镜头运动和要展示的重点，不超过 ${Math.min(this.data.maxPromptChars, 500)} 字。${refs}只输出画面描述本身，不要标题和解释。\n用户的想法：${idea}`;
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
