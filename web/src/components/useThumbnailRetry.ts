import { useEffect, useState } from "react";
import {
  forgetCover,
  rememberCover,
  sourceIdentity,
} from "./thumbnail-sources";

type Failure = { url: string; count: number; next: number };
const delays = [15_000, 60_000, 180_000];

// Each logical file gets at most three automatic retries. Fresh signatures
// may recover immediately within that budget; remount/manual refresh resets it.
export function useThumbnailRetry(owner: string, id: string, visible: boolean) {
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [tick, wake] = useState(0);
  useEffect(() => {
    const onVisible = () => wake((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    if (!visible || document.hidden) return;
    const future = Object.values(failures)
      .filter((f) => f.count <= delays.length && f.next > Date.now())
      .map((f) => f.next);
    if (!future.length) return;
    const timer = setTimeout(
      () => wake((n) => n + 1),
      Math.max(1, Math.min(...future) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [failures, visible, tick]);

  const allowed = (url: string) => {
    const failure = failures[sourceIdentity(url)];
    if (failure && (!visible || document.hidden)) return false;
    return (
      !failure ||
      (failure.count <= delays.length &&
        (failure.url !== url || failure.next <= Date.now()))
    );
  };
  const failed = (url: string) => {
    forgetCover(owner, id, url);
    const key = sourceIdentity(url);
    setFailures((current) => {
      const count = (current[key]?.count || 0) + 1;
      return {
        ...Object.fromEntries(Object.entries(current).slice(-5)),
        [key]: {
          url,
          count,
          next: Date.now() + (delays[count - 1] ?? Infinity),
        },
      };
    });
  };
  const loaded = (url: string, poster = false) => {
    if (poster) rememberCover(owner, id, url);
    const key = sourceIdentity(url);
    setFailures((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  return { allowed, failed, loaded };
}
