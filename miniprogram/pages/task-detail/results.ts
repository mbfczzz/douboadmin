import { freshUrl, noteIssued } from "../../utils/view-cache";
import { request, jobView, hasSession, sessionUserId, cancelled, saveFailed, error } from "../../utils/api";
import type { Job } from "../../services/types";
import { resultImages } from "../../services/result-images";
import { track } from "../../services/analytics";

type Page = {
  id: string;
  destroyed: boolean;
  visible?: boolean;
  previewing?: boolean;
  data: { job: ReturnType<typeof jobView> | null; busy: boolean };
  setData(value: Record<string, unknown>): void;
};

const active = (page: Page, owner: string) =>
  !page.destroyed && page.visible !== false && hasSession() && sessionUserId() === owner;

async function ready(page: Page) {
  const owner = sessionUserId();
  let job = page.data.job;
  if (!job || job.deleted || !active(page, owner)) return;
  if (job.userId && job.userId !== owner) return;
  const urls = job.input.kind === "image" ? resultImages(job) : [job.result];
  if (!urls.length || urls.some((url) => !freshUrl(url))) {
    job = jobView(await request<Job>("/jobs/" + page.id));
    if (!active(page, owner)) return;
    noteIssued(job.result, job.thumbnailUrl, ...job.results);
    page.setData({ job });
  }
  if (job.deleted || job.status !== "succeeded" || !job.result) throw new Error("作品暂时无法下载");
  return job;
}

export async function previewResults(page: Page, index = 0) {
  if (page.previewing) return;
  page.previewing = true;
  const owner = sessionUserId();
  try {
    const job = await ready(page);
    if (!job || job.input.kind !== "image" || !active(page, owner)) return;
    const urls = resultImages(job);
    if (urls[index]) wx.previewImage({ current: urls[index], urls });
  } catch (e) { if (active(page, owner)) error(e); }
  finally { page.previewing = false; }
}

export async function saveResults(page: Page, index?: number) {
  if (page.data.busy || !page.data.job || page.data.job.deleted) return;
  page.setData({ busy: true });
  const owner = sessionUserId();
  let saved = 0, total = 0;
  try {
    const job = await ready(page);
    if (!job || !active(page, owner)) return;
    const all = job.input.kind === "image" ? resultImages(job) : [job.result!];
    const urls = index === undefined ? all : all[index] ? [all[index]] : [];
    total = urls.length;
    if (!total) throw new Error("图片暂时无法下载");
    for (const url of urls) {
      if (!active(page, owner)) return;
      const file = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>((resolve, reject) =>
        wx.downloadFile({ url, success: resolve, fail: reject }));
      if (!active(page, owner)) return;
      if (file.statusCode !== 200) throw new Error("下载失败");
      if (job.input.kind === "image") await wx.saveImageToPhotosAlbum({ filePath: file.tempFilePath });
      else await wx.saveVideoToPhotosAlbum({ filePath: file.tempFilePath });
      saved++;
    }
    if (!active(page, owner)) return;
    wx.showToast({ title: total > 1 ? `已保存 ${saved} 张图片` : "已保存到相册", icon: "success" });
    track("work_saved", "task-detail", job.id);
  } catch (e) {
    if (!active(page, owner)) return;
    if (saved) wx.showToast({ title: `已保存 ${saved}/${total} 张，可单独保存剩余图片`, icon: "none", duration: 3500 });
    else if (!cancelled(e)) saveFailed(e);
  } finally { if (!page.destroyed) page.setData({ busy: false }); }
}
