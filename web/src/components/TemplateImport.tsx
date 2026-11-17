import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { api, APIError } from "../api";
import type { Notify } from "../navigation";
import Modal from "./Modal";

type Result = {
  total: number;
  applied: boolean;
  counts: Record<string, number>;
  items: {
    sourceId: string;
    title: string;
    action: string;
    reason?: string;
    chars: number;
    images: number;
    required: number;
  }[];
};
const labels: Record<string, string> = {
  create: "待导入",
  imported: "已导入",
  duplicate: "已有，保留",
  skip: "跳过图片",
  blocked: "需处理",
};

export default function TemplateImport({
  notify,
  onSaved,
}: {
  notify: Notify;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pack, setPack] = useState<unknown>();
  const [name, setName] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
      active.current?.abort();
    },
    [],
  );
  function close() {
    if (busy) return;
    revision.current++;
    active.current?.abort();
    setOpen(false);
    setPack(undefined);
    setResult(undefined);
    setError("");
    setName("");
    setPublish(false);
  }
  async function run(value: unknown, apply = false, publication = publish) {
    if (locked.current) return;
    locked.current = true;
    const version = ++revision.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>(
        `/admin/templates/${apply ? "import" : "import-preview"}`,
        {
          method: "POST",
          signal: controller.signal,
          confirmation: false,
          body: JSON.stringify({ pack: value, publish: publication }),
        },
      );
      if (version !== revision.current) return;
      setResult(r);
      if (apply) {
        onSaved();
        notify(
          `导入完成：新增 ${r.counts.imported || 0}，已有 ${r.counts.duplicate || 0}，跳过 ${r.counts.skip || 0}，需处理 ${r.counts.blocked || 0}`,
        );
      }
    } catch (e) {
      if (version === revision.current)
        setError(
          e instanceof APIError && [404, 405].includes(e.status)
            ? "当前服务尚未支持模板导入，请先部署新版 API"
            : (e as Error).message,
        );
    } finally {
      locked.current = false;
      if (active.current === controller) active.current = null;
      if (version === revision.current) setBusy(false);
    }
  }
  async function select(file?: File) {
    if (!file || busy) return;
    const version = ++revision.current;
    setBusy(true);
    setPack(undefined);
    setResult(undefined);
    setError("");
    setName(file.name);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("文件不能超过 8 MB");
      const value: unknown = JSON.parse(
        (await file.text()).replace(/^\uFEFF/, ""),
      );
      if (version !== revision.current) return;
      setPack(value);
      await run(value);
    } catch (e) {
      if (version === revision.current) setError((e as Error).message);
    } finally {
      if (version === revision.current) setBusy(false);
    }
  }
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        <Upload size={16} />
        导入模板
      </button>
      {open && (
        <Modal
          title="从 FlowLight 导入模板"
          subtitle="选择完整 JSON 导出文件，先预检再导入"
          onClose={close}
          className="form-modal"
        >
          <div className="form-body">
            <label>
              模板导出文件
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => void select(e.target.files?.[0])}
              />
            </label>
            {name && <p className="quiet">{name}</p>}
            <p>
              仅导入视频。完整提示词、图片用途、选填位置及可选模型会保留；图片模板列为跳过。同一来源编号不会重复创建或覆盖已有模板。
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={publish}
                disabled={busy}
                onChange={(e) => {
                  setPublish(e.target.checked);
                  setResult(undefined);
                  if (pack) void run(pack, false, e.target.checked);
                }}
              />
              按原文件上架状态导入（默认全部保存为草稿，更新小程序后再上架）
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {busy && (
              <p role="status">正在{result?.applied ? "处理" : "校验"}模板…</p>
            )}
            {result && (
              <>
                <p role="status">
                  共 {result.total} 条：
                  {Object.entries(labels)
                    .map(
                      ([key, label]) => `${label} ${result.counts[key] || 0}`,
                    )
                    .join("，")}
                </p>
                <div className="table-scroll" style={{ maxHeight: "42vh" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>模板</th>
                        <th>状态</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item) => (
                        <tr key={item.sourceId}>
                          <td>{item.title}</td>
                          <td>{labels[item.action]}</td>
                          <td>
                            {item.reason ||
                              `${item.chars} 字，${item.images} 个图片位置，${item.required} 个必填`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button className="secondary" disabled={busy} onClick={close}>
              关闭
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !pack ||
                !result ||
                !!result.applied ||
                !result.counts.create
              }
              onClick={() => void run(pack, true)}
            >
              {busy ? "处理中…" : "导入已通过的模板"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
