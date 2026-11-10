import { request, error } from "../../utils/api";
import type { AccessStatus } from "../../services/access";

// Name and phone; verify only when SMS is configured.
export const registerState = {
  name: "",
  phone: "",
  smsCode: "",
  countdown: 0,
  sending: false,
};

import type { Register } from "../../services/page-contracts";

export const validPhone = (phone: string) => /^1[3-9][0-9]{9}$/.test(phone);

export function stopCountdown(page: Register) {
  if (page.timer) clearInterval(page.timer);
  page.timer = undefined;
}

function startCountdown(page: Register, seconds: number) {
  stopCountdown(page);
  page.setData({ countdown: seconds });
  page.timer = setInterval(() => {
    const next = page.data.countdown - 1;
    if (next <= 0 || page.destroyed) stopCountdown(page);
    if (!page.destroyed) page.setData({ countdown: Math.max(next, 0) });
  }, 1000) as unknown as number;
}

// Prefill what the user already entered on an earlier visit.
export function prefill(page: Register, status: AccessStatus) {
  if (!page.data.name && status.name) page.setData({ name: status.name });
  if (!page.data.phone && status.phone) page.setData({ phone: status.phone });
}

export async function sendCode(page: Register) {
  const phone = page.data.phone.trim();
  if (page.data.sending || page.data.countdown > 0) return;
  if (!validPhone(phone)) {
    error(new Error("请输入 11 位手机号"));
    return;
  }
  page.setData({ sending: true });
  try {
    const out = await request<{ resendIn: number; debugCode?: string }>(
      "/access/sms",
      "POST",
      { phone },
    );
    if (page.destroyed) return;
    startCountdown(page, out.resendIn || 60);
    if (out.debugCode) page.setData({ smsCode: out.debugCode });
    wx.showToast({ title: "验证码已发送", icon: "none" });
  } catch (e) {
    if (!page.destroyed) error(e);
  } finally {
    if (!page.destroyed) page.setData({ sending: false });
  }
}

// Returns the new access status, or undefined when registration failed.
export async function register(page: Register) {
  const { name, phone, smsCode } = page.data;
  if (!name.trim()) return void error(new Error("请填写姓名"));
  const sms = page.data.status?.smsRequired !== false;
  if (!validPhone(phone.trim()))
    return void error(new Error("请输入 11 位手机号"));
  if (sms && !/^[0-9]{6}$/.test(smsCode))
    return void error(new Error("请输入 6 位验证码"));
  page.setData({ busy: true });
  try {
    const status = await request<AccessStatus>("/access/profile", "POST", {
      name: name.trim(),
      phone: phone.trim(),
      ...(sms ? { code: smsCode } : {}),
    });
    if (page.destroyed) return;
    stopCountdown(page);
    page.setData({ status, smsCode: "", countdown: 0 });
    return status;
  } catch (e) {
    if (!page.destroyed) error(e);
  } finally {
    if (!page.destroyed) page.setData({ busy: false });
  }
}
