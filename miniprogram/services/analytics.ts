import { API_BASE } from "../config";
import { sessionToken } from "./session";
export function track(name: string, page: string, targetId = "") {
  const token = sessionToken();
  if (!token || !wx.getStorageSync("analytics-consent")) return;
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
