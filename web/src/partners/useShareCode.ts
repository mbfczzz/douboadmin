import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Share } from "./types";

// Codes live only as long as this dialog. A tab uses its own cached response;
// switching away aborts an unfinished request rather than reusing another code.
export function useShareCode(path: string) {
  const cache = useRef(new Map<string, Share>());
  const active = useRef<AbortController | null>(null);
  const current = useRef(path);
  current.current = path;
  const [state, setState] = useState({ path, loading: true, error: "" });
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    // A reset or unbind invalidates the old code even if its reload fails.
    cache.current.delete(path);
    setState({ path, loading: true, error: "" });
    try {
      const data = await api<Share>(path, { signal: controller.signal });
      if (!controller.signal.aborted && current.current === path) {
        cache.current.set(path, data);
        setState({ path, loading: false, error: "" });
      }
    } catch (error) {
      if (!controller.signal.aborted && current.current === path)
        setState({ path, loading: false, error: (error as Error).message });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [path]);
  useEffect(() => {
    if (cache.current.has(path)) setState({ path, loading: false, error: "" });
    else void reload();
    return () => active.current?.abort();
  }, [path, reload]);
  const data = cache.current.get(path);
  return {
    data,
    loading: state.path === path ? state.loading : !data,
    error: state.path === path ? state.error : "",
    reload,
  };
}
