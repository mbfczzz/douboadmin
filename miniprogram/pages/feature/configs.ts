// Features whose backend is not connected yet (数字人, 视频唱歌, 图文成片,
// 漫画推文, 视频去字幕, 视频二创): their pages are laid out from these
// sections and only the final action says the feature is coming.
// `tab`: shown only while that entry of the page's tabs is chosen.
type Base = { tab?: number };
export type Section = Base & (
  | { type: "tabs"; values: string[] }
  | { type: "upload"; label?: string; media: "image" | "video"; hint: string }
  | { type: "text"; label?: string; placeholder: string; max: number }
  | { type: "chips"; label: string; values: string[]; multi?: boolean }
  | { type: "rows"; items: { label: string; value: string }[] }
  | { type: "notes"; label: string; lines: string[] });
export type FeatureConfig = { title: string; action: string; sections: Section[] };

const STORY: Section[] = [
  { type: "text", placeholder: "粘贴或输入文案，AI 会按段落配图、配音并合成视频", max: 5000 },
  { type: "chips", label: "成片方式", values: ["AI绘画", "视频素材", "相册图片"] },
  { type: "chips", label: "画面风格", values: ["通用", "都市言情", "仙侠古风", "悬疑惊悚", "国漫"] },
  { type: "rows", items: [{ label: "配音", value: "解说男声" }, { label: "视频比例", value: "9:16" }, { label: "背景音乐", value: "无" }, { label: "字幕", value: "开启" }] },
];

export const CONFIGS: Record<string, FeatureConfig> = {
  avatar: {
    title: "数字人",
    action: "开始制作",
    sections: [
      { type: "upload", label: "形象视频", media: "video", hint: "上传一段正脸、对着镜头说话的视频" },
      { type: "text", label: "口播文案", placeholder: "输入要说的话，数字人会用你的形象说出来", max: 1000 },
      { type: "chips", label: "声音", values: ["原声", "男声", "女声"] },
    ],
  },
  sing: {
    title: "视频唱歌",
    action: "立即生成",
    sections: [
      { type: "upload", media: "image", hint: "点击上传一张正脸照片" },
      { type: "chips", label: "曲风", values: ["全部", "流行歌曲", "经典老歌", "古风歌曲", "乐器弹奏"] },
    ],
  },
  article: { title: "图文成片", action: "一键生成视频", sections: STORY },
  comic: {
    title: "漫画推文",
    action: "下一步",
    sections: [STORY[0], { type: "chips", label: "绘画风格", values: ["通用", "都市言情", "仙侠古风", "悬疑惊悚", "国漫"] }, STORY[3]],
  },
  desub: {
    title: "视频去字幕",
    action: "开始处理",
    sections: [
      { type: "upload", label: "上传视频", media: "video", hint: "点击上传视频" },
      { type: "notes", label: "使用步骤", lines: ["上传符合要求的视频", "框选需要去除字幕的区域", "点击开始处理"] },
      { type: "notes", label: "使用说明", lines: ["视频 200MB 以内，720P 不超过 3 分钟，1080P 不超过 1 分钟", "处理时间取决于视频大小，请耐心等待"] },
    ],
  },
  remix: {
    title: "视频二创",
    action: "开始二创",
    sections: [
      { type: "tabs", values: ["短视频链接", "本地视频"] },
      { type: "text", placeholder: "粘贴视频链接，支持抖音等主流平台", max: 500, tab: 0 },
      { type: "upload", media: "video", hint: "点击上传本地视频", tab: 1 },
      { type: "chips", label: "画面特效（单选）", values: ["光线扫描", "左右开幕", "下降开幕", "上升开幕", "书单模式", "溶图模式", "横版三屏"] },
      { type: "chips", label: "视频调节（多选）", values: ["修改MD5", "镜像", "智能变速"], multi: true },
      { type: "rows", items: [{ label: "视频加结尾", value: "关闭" }] },
    ],
  },
};
