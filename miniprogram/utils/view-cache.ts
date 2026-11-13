import { sessionUserId } from "./api";

// Last-seen page data, so returning to a page (or a cold start) paints at
// once while fresh data loads. Scoped to the account; entries carry signed
// image URLs, so each read states how old a copy may still be shown.
type Entry<T> = { owner: string; at: number; value: T };
const memory = new Map<string, Entry<unknown>>();
const PREFIX = "view-cache:";

export function readView<T>(key: string, maxAgeMs: number): T | undefined {
  const owner = sessionUserId();
  let entry = memory.get(key) as Entry<T> | undefined;
  if (!entry) {
    try {
      const saved = wx.getStorageSync(PREFIX + key) as Entry<T> | "";
      if (saved) memory.set(key, (entry = saved));
    } catch {
      // nothing stored
    }
  }
  if (!entry || entry.owner !== owner || Date.now() - entry.at > maxAgeMs) return undefined;
  return entry.value;
}

export function writeView<T>(key: string, value: T, persist = true) {
  const entry = { owner: sessionUserId(), at: Date.now(), value };
  memory.set(key, entry);
  if (!persist) return;
  try {
    wx.setStorageSync(PREFIX + key, entry);
  } catch {
    // storage full: the memory copy still helps this session
  }
}

// Rows a list just showed, by id (this session only): a detail page opened
// from that list paints from it at once, then refreshes.
const rows = new Map<string, unknown>();
export function rememberRows(list: { id: string }[]) {
  for (const row of list) rows.set(row.id, row);
}
export function recallRow<T>(id: string): T | undefined {
  return rows.get(id) as T | undefined;
}

// Signed image URLs (results, thumbnails, avatars: 15 min; covers: at least
// 10 min left) are only reused while young. Issue times are noted when a URL
// first arrives from the server; an unknown URL counts as old.
const issued = new Map<string, number>();
const URL_KEEP_MS = 8 * 60 * 1000;
export function noteIssued(...urls: (string | undefined)[]) {
  const now = Date.now();
  for (const url of urls) if (url && !issued.has(url)) issued.set(url, now);
  // Polling adds new strings every few seconds: forget what can no longer be
  // kept, and cap the table (Map keeps insertion order, oldest first).
  if (issued.size > 300)
    for (const [url, at] of issued) {
      if (now - at < URL_KEEP_MS && issued.size <= 1000) break;
      issued.delete(url);
    }
}
export function freshUrl(url: string | undefined) {
  return !!url && Date.now() - (issued.get(url) ?? 0) < URL_KEEP_MS;
}

// Polling re-signs image URLs on every response; a changed src blanks and
// re-downloads the image. Keep the URL already shown for the same row while
// it is still young; otherwise take the new one.
export function keepImages<T extends { id: string; thumbnailUrl?: string; result?: string }>(shown: T[], fresh: T[]): T[] {
  const before = new Map(shown.map((row) => [row.id, row]));
  return fresh.map((row) => {
    noteIssued(row.thumbnailUrl, row.result);
    const old = before.get(row.id);
    if (!old) return row;
    return {
      ...row,
      ...(row.thumbnailUrl && freshUrl(old.thumbnailUrl) ? { thumbnailUrl: old.thumbnailUrl } : {}),
      ...(row.result && freshUrl(old.result) ? { result: old.result } : {}),
    };
  });
}

// Cached views hold signed URLs: show them only while those can still load.
export const VIEW_MAX_AGE = 5 * 60 * 1000;
