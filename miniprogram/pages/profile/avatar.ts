import { upload, errorMessage } from "../../utils/api";

interface Editor {
  data: { busy: boolean; uploadingAvatar: boolean };
  revision: number;
  ownerToken: string;
  setData(data: Record<string, unknown>): void;
  current(revision: number): boolean;
  updateDirty(): void;
}

export async function chooseProfileAvatar(page: Editor, path: string) {
  if (!path || page.data.busy || page.data.uploadingAvatar) return;
  const revision = page.revision;
  if (!page.current(revision)) return;
  page.setData({ uploadingAvatar: true, saveError: "", avatarError: "" });
  page.updateDirty();
  try {
    const size = await new Promise<number>((resolve, reject) =>
      wx.getFileSystemManager().getFileInfo({
        filePath: path,
        success: (file) => resolve(file.size),
        fail: () => reject(new Error("无法读取头像，请重新选择")),
      }),
    );
    if (size > 5 * 1024 * 1024) throw new Error("请选择 5 MB 以内的头像");
    if (!page.current(revision)) return;
    const asset = await upload(path, true, page.ownerToken);
    if (page.current(revision))
      page.setData({ avatarId: asset.id, avatarUrl: asset.data.url });
  } catch (e) {
    if (page.current(revision)) page.setData({ avatarError: errorMessage(e) });
  } finally {
    if (page.current(revision)) {
      page.setData({ uploadingAvatar: false });
      page.updateDirty();
    }
  }
}
