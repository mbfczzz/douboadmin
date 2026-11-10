import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

// Page-local query snapshots: never show another query's records, and discard
// unfinished requests on navigation. A refresh/write invalidates every snapshot.
export function useCachedResource<T>(path: string, pollMs = 0) {
  const cache = useRef(new Map<string, T>());
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const current = useRef(path);
  current.current = path;
  const [state, setState] = useState({ path, loading: true, error: "" });
  const load = useCallback(
    async (keepData = false) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      if (!keepData) cache.current.delete(path);
      setState((previous) => ({
        path,
        loading: true,
        error: keepData && previous.path === path ? previous.error : "",
      }));
      try {
        const data = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted && current.current === path) {
          // Bound memory while typing searches or paging through a large catalog.
          if (cache.current.size >= 20)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(path, data);
          setState({ path, loading: false, error: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted && current.current === path)
          setState({ path, loading: false, error: (error as Error).message });
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [path],
  );
  const latestLoad = useRef(load);
  latestLoad.current = load;
  // Async saves/syncs may finish after a tab change. Reload the current query,
  // and stop requesting entirely once its page or dialog has unmounted.
  const reload = useCallback(() => {
    if (!mounted.current) return Promise.resolve();
    cache.current.clear();
    return latestLoad.current();
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (cache.current.has(path)) {
      setState({ path, loading: false, error: "" });
      if (pollMs) void load(true);
    } else void load();
    const timer = pollMs
      ? setInterval(() => {
          if (!document.hidden && !active.current) void load(true);
        }, pollMs)
      : undefined;
    return () => {
      mounted.current = false;
      clearInterval(timer);
      active.current?.abort();
    };
  }, [path, load, pollMs]);
  return {
    data: cache.current.get(path),
    loading: state.path === path ? state.loading : !cache.current.has(path),
    error: state.path === path ? state.error : "",
    reload,
  };
}
