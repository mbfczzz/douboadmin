import type { Profile } from "../../services/types";

export function profileDraft(profile?: Profile) {
  return {
    nickname: profile?.nickname || "",
    name: profile?.name || "",
    phone: profile?.phone || "",
    bio: profile?.bio || "",
    avatarId: profile?.avatarId || "",
  };
}

export const profileState = {
  ...profileDraft(),
  avatarUrl: "",
  avatarError: "",
  loading: true,
  needsLogin: false,
  busy: false,
  uploadingAvatar: false,
  dirty: false,
  loadError: "",
  saveError: "",
  focusedField: "",
  fieldErrors: {} as Record<string, string>,
};

export function profileErrors(profile: ReturnType<typeof profileDraft>) {
  const errors: Record<string, string> = {};
  const nickname = profile.nickname.trim();
  if (!nickname) errors.nickname = "请填写昵称";
  else if (Array.from(nickname).length > 30)
    errors.nickname = "昵称不能超过 30 字";
  if (Array.from(profile.name.trim()).length > 50)
    errors.name = "姓名不能超过 50 字";
  const phone = profile.phone.trim();
  if (phone && !/^\+?[0-9]{7,15}$/.test(phone))
    errors.phone = "请填写有效手机号";
  if (Array.from(profile.bio).length > 120) errors.bio = "简介不能超过 120 字";
  return errors;
}

export function guardProfile(dirty: boolean) {
  if (dirty)
    wx.enableAlertBeforeUnload?.({
      message: "资料尚未保存，确定离开吗？",
      fail() {},
    });
  else wx.disableAlertBeforeUnload?.({ fail() {} });
}
