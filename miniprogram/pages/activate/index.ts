import {
  captureInvite,
  pendingInvite,
  clearInvite,
  scannedInvite,
} from "../../services/invitation";
import { signOutActivation } from "./sign-out";
import { loadBrand } from "../../services/branding";
import {
  request,
  signIn,
  hasSession,
  sessionUserId,
  error,
  errorMessage,
  AuthCancelledError,
  cancelled,
  RequestError,
} from "../../utils/api";
import {
  accessStatus,
  resetAccessNavigation,
  shareFrom,
} from "../../services/access";
import type { AccessStatus } from "../../services/access";
import { trackVisit } from "../../services/analytics";
import type { Config } from "../../services/types";
import {
  supportsPhoneLogin,
  authorizedPhoneCode,
} from "../../services/phone-login";
import {
  registerState,
  prefill,
  sendCode,
  register,
  stopCountdown,
  registerRequest,
} from "./register";
import { codeState, enterCode, clearCode, pasteCode } from "./code-entry";
import { showArt } from "../../utils/ui-art";

Page({
  data: {
    brandIcon: "",
    invite: "",
    logged: false,
    loading: true,
    busy: false,
    ...codeState,
    loadError: "",
    accountDeleted: false,
    wechatReady: false,
    phoneReady: false,
    status: null as AccessStatus | null,
    ...registerState,
  },
  inviteAttempt: "",
  owner: "",
  onLoad(options: Record<string, string>) {
    captureInvite(options);
    showArt(this, (art) => ({ backdrop: art.loginBackdrop }));
  },
  revision: 0,
  destroyed: false,
  entering: false,
  timer: undefined as number | undefined,
  onShow() {
    trackVisit(this);
    resetAccessNavigation();
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
    this.revision++;
    stopCountdown(this);
  },
  refresh() {
    if (!this.data.loading && !this.data.busy) void this.load();
  },
  async load() {
    const owner = sessionUserId();
    if (this.owner !== owner) {
      this.owner = owner;
      this.inviteAttempt = "";
      stopCountdown(this);
      this.setData({ ...registerState, ...codeState, status: null });
    }
    void loadBrand(this, () =>
      request<{ icon: string }>("/branding", "GET", undefined, undefined, false),
    );
    const revision = ++this.revision;
    this.setData({
      invite: pendingInvite(),
      logged: hasSession(),
      accountDeleted: wx.getStorageSync("account-deleted") === true,
      loading: true,
    });
    try {
      if (!hasSession()) {
        const c = await request<Config>(
          "/config",
          "GET",
          undefined,
          undefined,
          false,
        );
        if (revision === this.revision)
          this.setData({
            wechatReady: c.wechatLogin,
            phoneReady: !!c.wechatPhoneLogin && supportsPhoneLogin(),
            status: null,
            loadError: "",
            ...registerState,
            ...codeState,
          });
        return;
      }
      const status = await accessStatus();
      if (revision !== this.revision) return;
      if (status.status === "login" && !hasSession()) {
        await this.load();
        return;
      }
      this.setData({ status, logged: hasSession(), loadError: "" });
      prefill(this, status);
      if (status.active) {
        clearInvite();
        this.enter();
      }
    } catch (e) {
      if (revision === this.revision && !(e instanceof AuthCancelledError))
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (revision === this.revision) {
        this.setData({ loading: false });
        void this.joinInvite();
      }
    }
  },
  // The code formats as it is typed: "kmnp2345" shows as "KMNP-2345".
  // Reaching eight characters registers at once; no confirm button.
  input(e: WechatMiniprogram.Input) {
    const before = this.data.codeRaw.length;
    const raw = enterCode(this, e.detail.value);
    if (raw.length === 8 && before !== 8) this.confirm();
    return raw;
  },
  useCode() {
    if (!this.data.busy) this.setData({ codeMode: true, codeFocus: true });
  },
  useScan() {
    if (this.data.busy) return;
    clearCode(this);
    this.setData({ codeMode: false });
  },
  focusCode() {
    if (!this.data.busy) this.setData({ codeFocus: true });
  },
  blurCode() {
    this.setData({ codeFocus: false });
  },
  pasteCode() {
    if (!this.data.busy) pasteCode(this, () => this.confirm());
  },
  field(e: WechatMiniprogram.Input) {
    const key = e.currentTarget.dataset.field as string;
    if (["name", "phone", "smsCode"].includes(key))
      this.setData({ [key]: e.detail.value });
  },
  async sendCode() {
    if (!this.data.busy && this.data.logged) await sendCode(this);
  },
  async register() {
    if (this.data.busy || !this.data.logged) return;
    const status = await register(this);
    if (status?.active) this.enter();
    else if (status) await this.joinInvite();
  },
  async login() {
    await this.authenticate();
  },
  async phoneLogin(e: WechatMiniprogram.CustomEvent) {
    if (this.destroyed || this.data.busy) return;
    const code = authorizedPhoneCode(e);
    if (code) await this.authenticate(code);
  },
  async authenticate(phoneCode?: string) {
    if (this.data.busy) return;
    this.setData({ busy: true, loadError: "" });
    try {
      await signIn("wechat", phoneCode);
      if (!this.destroyed) await this.load();
    } catch (e) {
      if (!this.destroyed && !(e instanceof AuthCancelledError)) {
        const message = errorMessage(e, "微信登录未完成，请重试");
        this.setData(e instanceof RequestError && e.code === "ACCOUNT_DISABLED"
          ? { status: { active: false, status: "account_disabled", message }, loadError: "" }
          : { loadError: message });
        error(e);
      }
    } finally {
      if (!this.destroyed) {
        this.setData({ busy: false });
        await this.joinInvite();
      }
    }
  },
  async joinInvite() {
    const code = pendingInvite(),
      status = this.data.status;
    if (
      !code ||
      this.destroyed ||
      this.data.busy ||
      this.data.loading ||
      this.data.loadError ||
      !this.data.logged ||
      !status ||
      status.profileRequired ||
      !["pending", "unbound", "rejected"].includes(status.status) ||
      this.inviteAttempt === code
    )
      return;
    this.inviteAttempt = code;
    await this.join(code, "scan");
  },
  retryInvite() {
    this.inviteAttempt = "";
    void this.joinInvite();
  },
  async scan() {
    if (this.data.busy || this.data.loading || !this.data.logged) return;
    try {
      const result = await wx.scanCode({});
      if (this.destroyed) return;
      await this.join(scannedInvite(result), "scan");
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    }
  },
  confirm() {
    try {
      void this.join(shareFrom(this.data.code), "code");
    } catch (e) {
      error(e);
    }
  },
  async join(code: string, method: "scan" | "code") {
    if (this.data.busy || !this.data.logged) return;
    this.setData({ busy: true, code });
    try {
      const status = await registerRequest<AccessStatus>(this, "/access/join", {
        code,
        method,
      });
      if (!status || this.destroyed) return;
      // Scanning registers; approval opens the account later.
      if (code === pendingInvite()) {
        clearInvite();
        this.setData({ invite: "" });
      }
      this.setData({ status });
      clearCode(this);
      this.setData({ codeMode: false });
      if (status.active) this.enter();
      else wx.showToast({ title: "已登记，等待超级管理员开通", icon: "none" });
    } catch (e) {
      if (!this.destroyed) {
        if (e instanceof RequestError && e.status === 403) await this.load();
        if (!this.destroyed) error(e);
      }
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  enter() {
    if (this.entering || this.destroyed) return;
    this.entering = true;
    wx.reLaunch({
      url: "/pages/templates/index",
      fail: () => {
        this.entering = false;
        if (!this.destroyed)
          this.setData({ loadError: "进入失败，请点击重试" });
      },
    });
  },
  signOut() {
    return signOutActivation(this);
  },
  brandError() {
    this.setData({ brandIcon: "" });
  },
  privacy() {
    wx.openPrivacyContract({
      fail: () => error(new Error("隐私保护指引暂时无法打开")),
    });
  },
});
