import { API_BASE } from "../config";
export const media = (url: string) =>
  url.startsWith("/") ? API_BASE + url : url;
