import { useEffect, useState } from "react";

export function useRememberedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem("doubo-filter:" + key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("doubo-filter:" + key, JSON.stringify(value));
    } catch {
      /* Storage is optional in restricted browsers. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
