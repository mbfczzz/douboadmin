import { useMe } from "../session";
import { useEffect, useState } from "react";

export function useRememberedState<T>(key: string, initial: T) {
  const me = useMe();
  const storageKey = `doubo-filter:${me?.id || "guest"}:${me?.role || ""}:${me?.partnerId || ""}:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Storage is optional in restricted browsers. */
    }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
