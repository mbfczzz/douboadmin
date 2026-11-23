import { API_BASE } from "../config";
import { sessionToken } from "./session";
function analyticsAllowed() {
  try { return wx.getStorageSync("analytics-consent") === true; }
  catch { return false; }
}
export function track(name: string, page: string, targetId = "") {
  const token = sessionToken();
  if (!token || !analyticsAllowed()) return;
  wx.request({
    url: API_BASE + "/api/events",
    method: "POST",
    data: { name, page, targetId },
    header: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    timeout: 5000,
  });
}
// 功能使用 (后台 → 日志管理): one tap on a function's entry. Anonymous (no
// token, no ids), like visits; never retried.
export function featureClick(key: string) {
  if (!analyticsAllowed()) return;
  try {
    wx.request({ url: API_BASE + "/api/features/" + key + "/click", method: "POST", data: {}, timeout: 3000, success() {}, fail() {} });
  } catch {
    // statistics never block a tap
  }
}
// Anonymous visit statistics: no token, no account id, never retried.
let visitId = "",
  scene = 0,
  hiddenAt = 0,
  fresh = false,
  lastPage: unknown;
function newId() {
  let id = Date.now().toString(36);
  while (id.length < 24) id += Math.random().toString(36).slice(2);
  return id.slice(0, 24);
}
// A new visit starts at launch or after 30 minutes in the background.
export function resumeVisit(launchScene?: number) {
  if (!visitId || Date.now() - hiddenAt > 1800000) {
    visitId = newId();
    fresh = true;
  }
  scene = launchScene || 0;
}
export function pauseVisit() {
  hiddenAt = Date.now();
}
export function trackVisit(page: { route?: string }) {
  if (!analyticsAllowed()) return;
  const repeat = page === lastPage;
  lastPage = page;
  if (!visitId || !page.route || (repeat && !fresh)) return;
  fresh = false;
  try {
    let visitorId = wx.getStorageSync("visitor-id");
    if (!visitorId) wx.setStorageSync("visitor-id", (visitorId = newId()));
    const device = wx.getDeviceInfo
      ? wx.getDeviceInfo()
      : wx.getSystemInfoSync();
    wx.request({
      url: API_BASE + "/api/visits",
      method: "POST",
      data: {
        visitId,
        visitorId,
        page: page.route,
        scene,
        platform: device.platform,
      },
      timeout: 3000,
    });
  } catch {
    // Statistics never block a page.
  }
}
