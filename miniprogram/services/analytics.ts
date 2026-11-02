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
