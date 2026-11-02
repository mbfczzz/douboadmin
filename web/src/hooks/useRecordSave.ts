import { useState } from "react";
import { api, APIError, type Row } from "../api";

export function useRecordSave<T>(namespace: string, initial: Row<T>) {
  const [version, setVersion] = useState(initial.version);
  const [error, setError] = useState("");
  async function save(data: T) {
    setError("");
    try {
      await api(`/admin/${namespace}/${initial.id}`, {
        method: "PUT",
        body: JSON.stringify({ version, data }),
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
          setError(
            "记录已被其他人修改。你的草稿已保留，再次保存会覆盖最新版本，请确认后操作。",
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
