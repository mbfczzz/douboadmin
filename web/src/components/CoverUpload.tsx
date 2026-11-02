import { useEffect, useRef, useState } from "react";
import { Upload, Image } from "lucide-react";
import { api, type Row } from "../api";
export default function CoverUpload({
  value,
  onChange,
  onBusy,
}: {
  value: string;
  onChange: (url: string, id: string) => void;
  onBusy: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("封面不能超过 5 MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await api<Row<{ url: string }>>("/admin/assets?purpose=cover", {
        method: "POST",
        body,
        signal: abort.signal,
      });
      if (!abort.signal.aborted) onChange(r.data.url, r.id);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="cover-field">
      <label>
        模板封面
        <input
          disabled={busy}
          value={value}
          onChange={(e) => onChange(e.target.value, "")}
          placeholder="填写 HTTPS 地址，或上传图片"
          maxLength={3000}
        />
      </label>
      <div className="cover-upload">
        {value ? <img src={value} alt="模板封面预览" /> : <Image size={25} />}
        <label className="upload-control">
          <Upload size={15} />
          {busy ? "上传中…" : "上传封面"}
          <input
            aria-label="上传封面"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <small>JPG / PNG / WebP，最大 5 MB</small>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
