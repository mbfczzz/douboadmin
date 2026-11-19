import type { Art } from "../../utils/ui-art";

// Features whose backend is not connected yet (数字人, 视频唱歌, 图文成片,
// 漫画推文, 视频去字幕, 视频二创): their pages are laid out from these
// sections: uploads, choices and option sheets all work, the final action
// checks what is required and then says the feature is coming.
// `tab`: shown only while that entry of the page's tabs is chosen;
// `required`: what to say when that upload or text is still empty.
type Base = { tab?: number };
type Pick = { label: string; art?: keyof Art };
export type Section = Base & (
  | { type: "tabs"; values: string[] }
  | { type: "upload"; label?: string; media: "image" | "video"; hint: string; required?: string }
  | { type: "text"; label?: string; placeholder: string; max: number; required?: string }
  | { type: "examples"; label: string; values: { label: string; text: string }[] } // fill the text above
  | { type: "chips"; label: string; values: string[]; multi?: boolean }
  | { type: "styles"; label: string; values: Pick[] } // picture cards
  | { type: "rows"; items: { label: string; value: string; options: string[]; icon?: string }[]; grid?: boolean }
  | { type: "toggles"; items: { label: string; on: boolean }[] }
  | { type: "notes"; label: string; lines: string[] });
export type FeatureConfig = { title: string; action: string; sections: Section[] };

const STYLES: Pick[] = [
  { label: "通用", art: "styleGeneral" },
  { label: "都市言情", art: "styleRomance" },
  { label: "仙侠古风", art: "styleXianxia" },
  { label: "悬疑惊悚", art: "styleSuspense" },
  { label: "国漫", art: "styleGuoman" },
];
const STORY_TEXT: Section = { type: "text", placeholder: "粘贴或输入文案，AI 会按段落配图、配音并合成视频", max: 5000, required: "请先输入或粘贴文案" };
const STORY_EXAMPLES: Section = {
  type: "examples",
  label: "文案示例",
  values: [
    { label: "坚持的意义", text: "每天进步一点点，看起来毫不起眼，一年后回头看，你会感谢那个没有放弃的自己。" },
    { label: "深夜食堂", text: "凌晨两点的街角小店，老板总会给晚归的人多盛一碗热汤，他说：吃饱了，明天才有力气。" },
    { label: "古镇来信", text: "外婆从古镇寄来一封信，信里夹着一片桂花，她说今年的花开得特别好，等你回来。" },
  ],
};
const STORY_ROWS: Section = {
  type: "rows",
  grid: true,
  items: [
    { label: "配音", value: "解说男声", options: ["解说男声", "温柔女声", "活力少年", "沉稳大叔"], icon: "voice" },
    { label: "视频比例", value: "9:16", options: ["9:16", "16:9", "1:1", "3:4"], icon: "adjust" },
    { label: "背景音乐", value: "无", options: ["无", "轻快", "抒情", "悬疑", "热血"], icon: "music" },
    { label: "字幕", value: "开启", options: ["开启", "关闭"], icon: "subtitle" },
  ],
};

export const CONFIGS: Record<string, FeatureConfig> = {
  avatar: {
    title: "数字人",
    action: "开始制作",
    sections: [
      { type: "upload", label: "形象视频", media: "video", hint: "上传一段正脸、对着镜头说话的视频", required: "请先上传形象视频" },
      { type: "text", label: "口播文案", placeholder: "输入要说的话，数字人会用你的形象说出来", max: 1000, required: "请先输入口播文案" },
      { type: "chips", label: "声音", values: ["原声", "男声", "女声"] },
    ],
  },
  sing: {
    title: "视频唱歌",
    action: "立即生成",
    sections: [
      { type: "upload", media: "image", hint: "点击上传一张正脸照片", required: "请先上传一张照片" },
      { type: "chips", label: "曲风", values: ["全部", "流行歌曲", "经典老歌", "古风歌曲", "乐器弹奏"] },
    ],
  },
  article: {
    title: "图文成片",
    action: "一键生成视频",
    sections: [STORY_TEXT, STORY_EXAMPLES, { type: "chips", label: "成片方式", values: ["AI绘画", "视频素材", "相册图片"] }, { type: "styles", label: "画面风格", values: STYLES }, STORY_ROWS],
  },
  comic: {
    title: "漫画推文",
    action: "下一步",
    sections: [STORY_TEXT, STORY_EXAMPLES, { type: "styles", label: "绘画风格", values: STYLES }, STORY_ROWS],
  },
  desub: {
    title: "视频去字幕",
    action: "开始处理",
    sections: [
      { type: "upload", label: "上传视频", media: "video", hint: "点击上传视频（50MB 以内）", required: "请先上传视频" },
      { type: "notes", label: "使用步骤", lines: ["上传符合要求的视频", "框选需要去除字幕的区域", "点击开始处理"] },
      { type: "notes", label: "使用说明", lines: ["视频 50MB 以内，720P 不超过 3 分钟，1080P 不超过 1 分钟", "处理时间取决于视频大小，请耐心等待"] },
    ],
  },
  remix: {
    title: "视频二创",
    action: "开始二创",
    sections: [
      { type: "tabs", values: ["短视频链接", "本地视频"] },
      { type: "text", placeholder: "粘贴视频链接，支持抖音等主流平台", max: 500, tab: 0, required: "请先粘贴视频链接" },
      { type: "upload", media: "video", hint: "点击上传本地视频（50MB 以内）", tab: 1, required: "请先上传本地视频" },
      { type: "chips", label: "二创方式", values: ["视频画面二创", "提取音频二创", "提取文案二创"] },
      { type: "chips", label: "画面特效（单选）", values: ["光线扫描", "左右开幕", "下降开幕", "上升开幕", "书单模式", "溶图模式", "横版三屏"] },
      { type: "chips", label: "视频调节（多选）", values: ["修改MD5", "镜像", "智能变速"], multi: true },
      { type: "toggles", items: [{ label: "视频加结尾", on: false }, { label: "视频加片头", on: false }] },
    ],
  },
};
