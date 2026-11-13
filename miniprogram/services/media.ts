import { API_BASE } from "../config";
export const media = (url: string) =>
  url.startsWith("/") ? API_BASE + url : url;

// Remote images must be ready HTTPS URLs; never upgrade an HTTP origin blindly.
export const httpsImage = (url?: string) =>
  url && /^https:\/\/[^/\s]+(?:\/|$)/i.test(url) ? url : "";
