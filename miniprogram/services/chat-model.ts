import type { Config, Model } from "./types";
import { loadConfig } from "../utils/config-cache";
// Through utils/api, like loadConfig, so both see the same request.
import { request, login, SessionExpiredError } from "../utils/api";

// The chat model the Agent and AI写剧本 talk to: the user's choice, else
// DeepSeek Flash (fast, cheap, reads pictures), else the first one listed.
export const DEFAULT_CHAT = "deepseek:deepseek-flash";
export const CHAT_CHOICE = "agent-model";

export function preferredChat<T extends { id: string; key?: string }>(models: T[], saved = wx.getStorageSync(CHAT_CHOICE) as string): T | undefined {
  return models.find((m) => m.id === saved) || models.find((m) => m.key === DEFAULT_CHAT) || models[0];
}

export const chatOf = (config: Config) => preferredChat(config.models.filter((m) => m.kind === "chat"));

// The model to send with (id: the one picked on the page). No chat model
// usually means a login the server no longer knows (it lists models only to
// signed-in users): check it, sign in again if needed, then read afresh.
export async function chatModel(id?: string): Promise<Model> {
  const pick = (c: Config) => c.models.find((m) => m.kind === "chat" && m.id === id) || chatOf(c);
  const found = pick(await loadConfig());
  if (found) return found;
  try {
    await request("/me/identity");
  } catch (e) {
    if (!(e instanceof SessionExpiredError)) throw e;
    await login();
  }
  const fresh = pick(await loadConfig(true));
  if (!fresh) throw new Error("创作助手暂未开放，请稍后再试");
  return fresh;
}
