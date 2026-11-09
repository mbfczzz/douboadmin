import { useRef, useState } from "react";
import { api, APIError, type Row } from "../api";
import type { ConfirmationOptions } from "../confirmation/request";

// onConflict lets an editor rebuild its draft on top of the latest record
// (e.g. keep only the fields this dialog changed) after a version conflict.
export function useRecordSave<T>(
  namespace: string,
  initial: Row<T>,
  onConflict?: (latest: T, base: T) => void,
  summary?: Pick<ConfirmationOptions, "labels" | "title" | "format">,
  // Shapes server data like the editor's draft (e.g. filled-in defaults), so
  // the change summary compares like with like, also after a conflict.
  normalize: (data: T) => T = (data) => data,
) {
  const [version, setVersion] = useState(initial.version);
  const [error, setError] = useState("");
  const before = useRef(normalize(initial.data));
  async function save(data: T) {
    setError("");
    try {
      await api(`/admin/${namespace}/${initial.id}`, {
        method: "PUT",
        body: JSON.stringify({ version, data }),
        confirmation: { ...summary, before: before.current },
      });
      return true;
    } catch (e) {
      if (e instanceof APIError && e.status === 409) {
        try {
          const rows = await api<Row<T>[]>(`/admin/${namespace}`);
          const latest = rows.find((r) => r.id === initial.id);
          if (!latest) {
            setError("该记录已被删除，你的草稿已保留。请复制内容后新建记录。");
            return false;
          }
          setVersion(latest.version);
          const base = before.current;
          before.current = normalize(latest.data);
          onConflict?.(latest.data, base);
          setError(
            onConflict
              ? "记录已被其他人修改。已载入最新版本并保留你在此弹窗中的修改，请确认后再次保存。"
              : "记录已被其他人修改。你的草稿已保留，再次保存会覆盖最新版本，请确认后操作。",
          );
        } catch {
          setError("保存冲突，草稿已保留。请恢复网络后重试。");
        }
      } else setError((e as Error).message);
      return false;
    }
  }
  return { save, error };
}
