import {
  request,
  error,
  errorMessage,
  enterPage,
  hasSession,
  login,
  sessionToken,
  returnAfterTransition,
  media,
  AuthCancelledError,
} from "../../utils/api";
import type { Me } from "../../services/types";
import {
  profileDraft,
  profileState,
  profileErrors,
  guardProfile,
} from "./form";
import { chooseProfileAvatar } from "./avatar";
import { saveProfile } from "./save";

Page({
  data: { ...profileState, me: null as Me | null },
  revision: 0,
  editVersion: 0,
  ownerToken: "",
  baseline: "",
  destroyed: false,
  visible: true,
  leaving: false,
  confirming: false,
  saved: false,
  onLoad() {
    void this.load();
  },
  onShow() {
    this.visible = true;
    enterPage(this);
    if (this.ownerToken && this.ownerToken !== sessionToken()) {
      void this.load();
      return;
    }
    if (this.saved) void this.leave();
  },
  onHide() {
    this.visible = false;
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
  },
  current(revision: number) {
    if (this.destroyed || revision !== this.revision) return false;
    if (this.ownerToken && this.ownerToken === sessionToken()) return true;
    this.revision++;
    this.ownerToken = "";
    this.baseline = "";
    this.setData({
      ...profileState,
      me: null,
      loading: false,
      needsLogin: true,
    });
    guardProfile(false);
    return false;
  },
  async load() {
    const revision = ++this.revision;
    this.ownerToken = sessionToken();
    this.baseline = "";
    this.saved = false;
    this.setData({
      ...profileState,
      me: null,
      loading: hasSession(),
      needsLogin: !hasSession(),
    });
    guardProfile(false);
    if (!hasSession()) return;
    try {
      const me = await request<Me>("/me");
      if (!this.current(revision)) return;
      const draft = profileDraft(me.profile.data);
      this.editVersion = me.profile.version;
      this.baseline = JSON.stringify(draft);
      this.setData({
        me,
        ...draft,
        avatarUrl: me.profile.data.avatarUrl
          ? media(me.profile.data.avatarUrl)
          : "",
      });
    } catch (e) {
      if (this.current(revision) && !(e instanceof AuthCancelledError))
        this.setData({ loadError: errorMessage(e) });
    } finally {
      if (!this.destroyed && revision === this.revision)
        this.setData({ loading: false });
    }
  },
  async signIn() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await login("profile");
      if (!this.destroyed) await this.load();
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  updateDirty() {
    if (this.destroyed) return;
    const dirty = this.baseline !== JSON.stringify(profileDraft(this.data));
    this.setData({ dirty });
    guardProfile(dirty || this.data.uploadingAvatar || this.data.busy);
  },
  input(e: WechatMiniprogram.Input) {
    if (this.data.busy) return;
    const field = e.currentTarget.dataset.field;
    if (!["nickname", "name", "bio"].includes(field)) return;
    this.setData({
      [field]: e.detail.value,
      saveError: "",
      fieldErrors: { ...this.data.fieldErrors, [field]: "" },
    });
    this.updateDirty();
  },
  focus(e: WechatMiniprogram.CustomEvent) {
    const field = e.currentTarget.dataset.field;
    if (!this.data.busy && this.data.focusedField !== field)
      this.setData({ focusedField: field });
  },
  blur(e: WechatMiniprogram.Input) {
    this.input(e);
    const field = e.currentTarget.dataset.field;
    if (this.data.focusedField === field) this.setData({ focusedField: "" });
    this.setData({
      fieldErrors: {
        ...this.data.fieldErrors,
        [field]:
          profileErrors(
            profileDraft(this.data),
            !!this.data.me?.profile.data.verifiedPhone,
          )[field] || "",
      },
    });
  },
  next(e: WechatMiniprogram.Input) {
    if (this.data.busy) return;
    this.input(e);
    this.setData({ focusedField: e.currentTarget.dataset.next });
  },
  done() {
    this.setData({ focusedField: "" });
    wx.hideKeyboard?.({ fail() {} });
  },
  async chooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    if (!this.data.me) return;
    await chooseProfileAvatar(this, e.detail.avatarUrl);
  },
  async save(e?: WechatMiniprogram.FormSubmit) {
    await saveProfile(this, e);
  },
  async back() {
    if (this.data.busy || this.confirming || this.leaving) return;
    this.confirming = true;
    try {
      if (this.data.dirty || this.data.uploadingAvatar) {
        const result = await wx.showModal({
          title: "放弃修改？",
          content: "本次修改尚未保存，离开后将不会保留。",
          confirmText: "放弃修改",
          cancelText: "继续编辑",
        });
        if (!result.confirm || this.destroyed) return;
      }
      await this.leave();
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      this.confirming = false;
    }
  },
  async leave() {
    if (this.leaving || this.destroyed) return;
    this.leaving = true;
    guardProfile(false);
    try {
      await returnAfterTransition("/pages/mine/index");
      if (this.saved && this.ownerToken === sessionToken())
        wx.showToast({ title: "已保存", icon: "success", duration: 1200 });
    } catch (e) {
      if (!this.destroyed) {
        this.leaving = false;
        this.setData({
          saveError: this.saved
            ? "资料已保存，返回失败，请点击返回重试"
            : "返回失败，请重试",
        });
        if (!this.saved) this.updateDirty();
      }
    }
  },
});
