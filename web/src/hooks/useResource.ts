import { useCallback, useEffect, useRef, useState } from "react";
import { api, invalidatesPrivateData } from "../api";

// Each page owns its requests. Aborting superseded work prevents stale results.
export function useResource<T>(path: string, pollMs = 0) {
  const [result, setResult] = useState<{ path: string; data: T }>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    try {
      const value = await api<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted) setResult({ path, data: value });
    } catch (e) {
      if (!controller.signal.aborted) {
        if (invalidatesPrivateData(e)) setResult(undefined);
        setError((e as Error).message);
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    const timer = pollMs
      ? setInterval(() => {
          if (!document.hidden && !active.current) void reload();
        }, pollMs)
      : undefined;
    return () => {
      clearInterval(timer);
      active.current?.abort();
    };
  }, [reload, pollMs]);
  return {
    data: result?.path === path ? result.data : undefined,
    loading,
    error,
    reload,
  };
}
