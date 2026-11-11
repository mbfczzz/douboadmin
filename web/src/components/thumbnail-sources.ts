export function mediaURL(value?: string) {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

export function sourceIdentity(value: string) {
  const url = new URL(value, "https://local.invalid");
  return url.searchParams.has("x-oss-signature")
    ? url.origin +
        url.pathname +
        "?" +
        (url.searchParams.get("x-oss-process") || "") +
        "&versionId=" +
        (url.searchParams.get("versionId") || "")
    : value;
}

// Only successfully loaded covers enter this bounded, memory-only cache.
const covers = new Map<string, { url: string; expires: number }>();
const cacheKey = (owner: string, id: string, url: string) =>
  owner + ":" + id + ":" + sourceIdentity(url);

export function cachedCover(owner: string, id: string, url: string) {
  if (!url) return "";
  const key = cacheKey(owner, id, url),
    cached = covers.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  covers.delete(key);
  return url;
}

export function rememberCover(owner: string, id: string, url: string) {
  if (covers.size >= 100) covers.delete(covers.keys().next().value!);
  covers.set(cacheKey(owner, id, url), {
    url,
    expires: Date.now() + 5 * 60_000,
  });
}

export function forgetCover(owner: string, id: string, url: string) {
  const key = cacheKey(owner, id, url);
  if (covers.get(key)?.url === url) covers.delete(key);
}
