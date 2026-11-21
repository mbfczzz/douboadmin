import { showArt } from "../../utils/ui-art";
import type { Art } from "../../utils/ui-art";

// AI证件照: the 背景 / 服装 / 尺寸 chips write the prompt; 案例 are finished
// examples (Codex pictures of fictional people, ui-art id-*) whose 做同款
// sets those chips. The user's own face photo is never replaced by one.
export type Choice = { label: string; text: string };
export type Option = { key: string; label: string; values: Choice[] };
export type IdChoice = Record<string, number>;

export const ID_OPTIONS: Option[] = [
  { key: "bg", label: "背景", values: [{ label: "白底", text: "白色" }, { label: "蓝底", text: "蓝色" }, { label: "红底", text: "红色" }] },
  { key: "dress", label: "服装", values: [{ label: "原服装", text: "保留原来的服装" }, { label: "正装西服", text: "换成深色正装西服配白衬衫" }, { label: "白衬衫", text: "换成白色衬衫" }] },
  { key: "size", label: "尺寸", values: [{ label: "一寸", text: "一寸（25×35mm）" }, { label: "二寸", text: "二寸（35×49mm）" }, { label: "小二寸", text: "小二寸（33×48mm）" }] },
];

export function idPrompt(choice: IdChoice) {
  const pick = (o: Option) => o.values[choice[o.key] || 0].text;
  return `将@图片1中的人物生成标准证件照：正面免冠，五官清晰，表情自然，光线均匀，${pick(ID_OPTIONS[0])}纯色背景，${pick(ID_OPTIONS[1])}，按${pick(ID_OPTIONS[2])}证件照比例头肩构图，保持本人长相不变。`;
}

export const ID_CASES: { id: string; title: string; art: keyof Art; choice: IdChoice }[] = [
  { id: "id:blue-suit", title: "蓝底正装·一寸", art: "idBlueSuit", choice: { bg: 1, dress: 1, size: 0 } },
  { id: "id:white-shirt", title: "白底白衬衫·二寸", art: "idWhiteShirt", choice: { bg: 0, dress: 2, size: 1 } },
  { id: "id:red-casual", title: "红底原服装·小二寸", art: "idRedCasual", choice: { bg: 2, dress: 0, size: 2 } },
  { id: "id:white-tee", title: "白底简约·一寸", art: "idWhiteTee", choice: { bg: 0, dress: 0, size: 0 } },
];

type Page = {
  data: { prompt: string; maxPromptChars: number; assets: { isImage?: boolean }[] };
  setData(data: Record<string, unknown>): void;
};

// The 案例 strip, its pictures from the decorative art.
export function loadIdCases(page: Page) {
  showArt(page, (art) => ({ featureCases: ID_CASES.map((c) => ({ id: c.id, cover: art[c.art], title: c.title, seconds: 0 })) }));
}

// 做同款: the case's chips and their prompt; the photo stays the user's.
export function applyIdCase(page: Page, id: string) {
  const c = ID_CASES.find((x) => x.id === id);
  if (!c) return false;
  const prompt = idPrompt(c.choice);
  page.setData({ featureChoice: { ...c.choice }, prompt, hasPrompt: true });
  const hasPhoto = page.data.assets.some((a) => a.isImage);
  wx.showToast({ title: hasPhoto ? "已填入同款设置" : "已填入同款设置，上传你的正脸照片即可生成", icon: "none" });
  return true;
}
