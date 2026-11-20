import type { Config } from "./types";

// The chat model the Agent and AI写剧本 talk to: the user's choice, else
// DeepSeek Flash (fast, cheap, reads pictures), else the first one listed.
export const DEFAULT_CHAT = "deepseek:deepseek-flash";
export const CHAT_CHOICE = "agent-model";

export function preferredChat<T extends { id: string; key?: string }>(models: T[], saved = wx.getStorageSync(CHAT_CHOICE) as string): T | undefined {
  return models.find((m) => m.id === saved) || models.find((m) => m.key === DEFAULT_CHAT) || models[0];
}

export const chatOf = (config: Config) => preferredChat(config.models.filter((m) => m.kind === "chat"));
