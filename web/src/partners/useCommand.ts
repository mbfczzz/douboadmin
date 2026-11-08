import { useRef, useState } from "react";
import { api, type APIInit } from "../api";
export function useCommand() {
  const [busy, setBusy] = useState(false),
    pending = useRef({ hash: "", key: "" }),
    running = useRef(false);
  async function send<T>(
    path: string,
    body: unknown,
    method = "POST",
    confirmation?: APIInit["confirmation"],
  ): Promise<T> {
    if (running.current) throw Error("操作正在处理中");
    running.current = true;
    setBusy(true);
    try {
      const hash = JSON.stringify({ path, body, method }),
        storageKey = "doubo-partner-command:" + method + ":" + path;
      if (pending.current.hash !== hash) {
        let saved: { hash: string; key: string } | undefined;
        try {
          saved =
            JSON.parse(sessionStorage.getItem(storageKey) || "null") ||
            undefined;
        } catch {
          /* Storage is optional in restricted browsers. */
        }
        pending.current =
          saved?.hash === hash && typeof saved.key === "string"
            ? saved
            : { hash, key: crypto.randomUUID() };
      }
      const key = pending.current.key;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(pending.current));
      } catch {
        /* Keep the in-memory idempotency key. */
      }
      const result = await api<T>(path, {
        method,
        confirmation,
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": key },
      });
      pending.current = { hash: "", key: "" };
      try {
        if (
          JSON.parse(sessionStorage.getItem(storageKey) || "null")?.key === key
        )
          sessionStorage.removeItem(storageKey);
      } catch {
        /* No financial state lives in browser storage. */
      }
      return result;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { send, busy };
}
