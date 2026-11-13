import { request, sessionUserId } from "./api";
import type { Config } from "../services/types";

// /config is heavy on the server (all models and templates) and many pages
// ask for it. One copy per account is shared: concurrent callers share one
// request, a fresh copy is reused for two minutes, and the last copy is kept
// in storage so a cold start can paint before the network answers.
const FRESH_MS = 2 * 60 * 1000;
const STORE = "config-cache";
type Entry = { owner: string; at: number; value: Config };
let memory: Entry | undefined;
let pending: { owner: string; promise: Promise<Config> } | undefined;

// The last known config for this account, for first paint only. Pages that
// let the user act on it (create) pass a short age limit.
export function peekConfig(maxAgeMs = Infinity): Config | undefined {
  const owner = sessionUserId();
  let entry = memory?.owner === owner ? memory : undefined;
  if (!entry) {
    try {
      const saved = wx.getStorageSync(STORE) as Entry | "";
      if (saved && saved.owner === owner && saved.value) entry = saved;
    } catch {
      // no stored copy
    }
  }
  return entry && Date.now() - entry.at <= maxAgeMs ? entry.value : undefined;
}

export function loadConfig(force = false): Promise<Config> {
  const owner = sessionUserId();
  if (!force && memory?.owner === owner && Date.now() - memory.at < FRESH_MS) return Promise.resolve(memory.value);
  if (!force && pending?.owner === owner) return pending.promise;
  const promise = request<Config>("/config", "GET", undefined, undefined, false).then((value) => {
    if (sessionUserId() === owner) {
      memory = { owner, at: Date.now(), value };
      try {
        wx.setStorageSync(STORE, memory);
      } catch {
        // storage full: memory copy still serves this session
      }
    }
    return value;
  });
  const attempt = { owner, promise };
  pending = attempt;
  const settle = () => {
    if (pending === attempt) pending = undefined;
  };
  promise.then(settle, settle);
  return promise;
}
