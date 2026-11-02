import { request } from "./request";
import { uid } from "./ids";
import type { Job, Input } from "./types";
import { confirmBudget } from "./business";
import { track } from "./analytics";
import { RequestError } from "./errors";
export async function submitInput(input: Input, channel: string) {
  const storage = "pending-" + channel;
  const fingerprint = JSON.stringify(input);
  let pending = wx.getStorageSync(storage) as
    { fingerprint: string; key: string; input?: Input } | undefined;
  if (!pending || pending.fingerprint !== fingerprint) {
    pending = { fingerprint, key: uid(), input: await confirmBudget(input) };
    wx.setStorageSync(storage, pending);
  }
  if (!pending.input) {
    pending.input = await confirmBudget(input);
    wx.setStorageSync(storage, pending);
  }
  let j: Job;
  try {
    j = await request<Job>("/jobs", "POST", pending.input, pending.key);
  } catch (e) {
    if (
      e instanceof RequestError &&
      e.status === 409 &&
      e.message.includes("积分价格")
    )
      wx.removeStorageSync(storage);
    throw e;
  }
  wx.removeStorageSync(storage);
  track("generate_submit", "create", j.id);
  return j;
}
