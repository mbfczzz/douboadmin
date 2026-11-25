import { upload, error, cancelled, chooseMediaFile, chooseReferenceFile, checkUploadSize, request } from "../../utils/api";
import { askChat, chatChoices } from "../../services/ai-script";
import { loadConfig } from "../../utils/config-cache";
import { pickerItems, savedModel, saveModel } from "../../utils/model-pick";
import type { Asset, Row } from "../../services/types";

// 文案提取 from a picture (图片提取), a phone video (本地视频) or a file sent
// in a chat (微信文件: pictures and videos). A chat model reads it: a
// picture's text as laid out, a video's narration, lines and captions in
// order. Audio waits for a speech-to-text service.
type Result = { title: string; author: string; text: string };
type Page = {
  data: { busy: boolean; working: string; readModel: string };
  destroyed?: boolean;
  revision: number;
  visible?: boolean;
  setData(data: Record<string, unknown>): void;
};

const PICTURE = "请提取这张图片中的全部文字，按原有段落和换行原样输出；只输出文字本身，不要解释。没有文字时回答：图片中没有识别到文字。";
const VIDEO = "请把这段视频里的口播、台词和画面字幕按时间顺序整理成完整文案；只输出文案本身，不要分析和解释。没有可识别的文字时回答：视频中没有识别到文案。";

async function read(page: Page, key: string, row: Row<Asset>) {
  const video = row.data.type.startsWith("video/");
  const revision = ++page.revision;
  page.setData({ busy: true, working: key, video: null, resultKey: "" });
  try {
    const text = await askChat(video ? VIDEO : PICTURE, { assets: [row.id], needs: video ? "video" : "image", channel: "extract-" + key, alive: () => revision === page.revision, model: page.data.readModel });
    if (revision !== page.revision || !text) return;
    const result: Result = { title: video ? "视频中的文案" : "图片中的文字", author: "", text };
    page.setData({ video: result, resultKey: key });
    void request("/features/extract/use", "POST").catch(() => undefined); // 功能使用
  } catch (e) {
    if (revision === page.revision && !cancelled(e)) error(e);
  } finally {
    if (revision === page.revision) page.setData({ busy: false, working: "" });
  }
}

async function pick(page: Page, key: string, choose: () => Promise<{ path: string }>) {
  if (page.data.busy) return;
  try {
    const file = await choose();
    page.setData({ busy: true, working: key });
    const row = await upload(file.path);
    await read(page, key, row);
  } catch (e) {
    if (!cancelled(e)) error(e);
    page.setData({ busy: false, working: "" });
  }
}

// The chat models that read pictures (the 识别模型 picker); one that cannot
// take a video gives way to one that can (askChat).
export async function loadReadModels(page: Page) {
  const list = chatChoices((await loadConfig()).models, "image");
  if (!page.destroyed) page.setData({ readModels: pickerItems(list), readModel: savedModel("extract", list)?.id || "" });
}

export const mediaHandlers = {
  chooseReadModel(this: Page, e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    saveModel("extract", e.detail.id);
    this.setData({ readModel: e.detail.id });
  },
  extractImage(this: Page) {
    return pick(this, "image", () => chooseMediaFile(true));
  },
  extractVideo(this: Page) {
    return pick(this, "video", () => chooseReferenceFile("video"));
  },
  // From a chat: a picture or a video; audio and documents are not read yet.
  extractFile(this: Page) {
    return pick(this, "file", async () => {
      const r = await wx.chooseMessageFile({ count: 1, type: "all", extension: ["jpg", "jpeg", "png", "webp", "mp4", "mov", "mp3", "wav", "m4a", "pdf", "doc", "docx", "txt"] });
      const f = r.tempFiles[0];
      if (!/\.(jpe?g|png|webp|mp4|mov)$/i.test(f.name)) throw new Error("暂只支持聊天里的图片和视频，音频和文档即将开放");
      checkUploadSize(f.size, /\.(mp4|mov)$/i.test(f.name));
      return { path: f.path };
    });
  },
};
