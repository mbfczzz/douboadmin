import { request, errorMessage, RequestError } from "../../utils/api";
import type { Me } from "../../services/types";
import {
  profileDraft,
  profileState,
  profileErrors,
  guardProfile,
} from "./form";

interface Editor {
  data: typeof profileState & { me: Me | null };
  revision: number;
  editVersion: number;
  ownerToken: string;
  baseline: string;
  saved: boolean;
  visible: boolean;
  setData(data: Record<string, unknown>): void;
  current(revision: number): boolean;
  updateDirty(): void;
  load(): Promise<void>;
  leave(): Promise<void>;
}

export async function saveProfile(
  page: Editor,
  e?: WechatMiniprogram.FormSubmit,
) {
  if (page.data.busy || page.data.uploadingAvatar || !page.data.me) return;
  const revision = page.revision;
  if (!page.current(revision)) return;
  const values = e?.detail.value as Record<string, string> | undefined;
  if (values)
    page.setData({
      nickname: values.nickname ?? page.data.nickname,
      name: values.name ?? page.data.name,
      phone: values.phone ?? page.data.phone,
      bio: values.bio ?? page.data.bio,
    });
  page.updateDirty();
  const fieldErrors = profileErrors(
    profileDraft(page.data),
    !!page.data.me.profile.data.verifiedPhone,
  );
  page.setData({ fieldErrors, saveError: "" });
  if (Object.keys(fieldErrors).length) {
    page.setData({ focusedField: Object.keys(fieldErrors)[0] });
    return;
  }
  if (!page.data.dirty) {
    await page.leave();
    return;
  }
  page.setData({ busy: true, saveError: "" });
  page.updateDirty();
  try {
    await request(
      "/me",
      "PUT",
      { version: page.editVersion, ...profileDraft(page.data) },
      undefined,
      false,
      page.ownerToken,
    );
    if (!page.current(revision)) return;
    page.baseline = JSON.stringify(profileDraft(page.data));
    page.saved = true;
    page.setData({ dirty: false });
    guardProfile(false);
    if (page.visible) await page.leave();
  } catch (e) {
    if (!page.current(revision)) return;
    if (e instanceof RequestError && e.status === 409) {
      try {
        const me = await request<Me>("/me");
        if (!page.current(revision)) return;
        page.editVersion = me.profile.version;
        page.setData({
          me,
          saveError: "资料已在其他地方更新，请确认当前内容后重新保存",
        });
      } catch (refreshError) {
        if (page.current(revision))
          page.setData({ saveError: "版本刷新失败，请重试后再保存" });
      }
    } else page.setData({ saveError: errorMessage(e) });
  } finally {
    if (page.current(revision)) {
      page.setData({ busy: false });
      if (!page.saved) page.updateDirty();
    }
  }
}
