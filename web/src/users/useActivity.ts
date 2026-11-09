import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { LogEntry, LogPage } from "../logs/types";

// Cursor-paged log entries that accumulate: "加载更多" appends the next page.
export function useActivity(base: string, scope: string) {
  const [items, setItems] = useState<LogEntry[]>([]),
    [next, setNext] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    active = useRef<AbortController | null>(null);
  const load = useCallback(
    async (before = "") => {
      active.current?.abort();
      const c = new AbortController();
      active.current = c;
      setLoading(true);
      setError("");
      try {
        const page = await api<LogPage>(
          `${base}?scope=${scope}&limit=50${before ? "&before=" + before : ""}`,
          { signal: c.signal },
        );
        if (c.signal.aborted) return;
        setItems((prev) => (before ? [...prev, ...page.items] : page.items));
        setNext(page.next || "");
      } catch (e) {
        if (!c.signal.aborted) setError((e as Error).message);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    },
    [base, scope],
  );
  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, [load]);
  return {
    items,
    next,
    loading,
    error,
    more: () => load(next),
    reload: () => load(),
  };
}
