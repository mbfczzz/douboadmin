import { useEffect, useState, type FormEvent } from "react";
import { api, type Row, type Model } from "../api";
import type { Platform } from "./types";

export default function PlatformForm({
  row,
  models,
  onSaved,
  notify,
}: {
  row: Row<Platform>;
  models: Row<Model>[];
  onSaved: () => unknown;
  notify: (s: string) => void;
}) {
  const [value, setValue] = useState(row.data),
    [keywords, setKeywords] = useState(row.data.hotKeywords.join("\n")),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(row.data);
    setKeywords(row.data.hotKeywords.join("\n"));
    setDirty(false);
  }, [row]);
  const patch = (v: Partial<Platform>) => setValue((s) => ({ ...s, ...v }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api("/admin/platform", {
        method: "PUT",
        body: JSON.stringify({
          version: row.version,
          data: {
            ...value,
            hotKeywords: keywords
              .split(/\r?\n/)
              .map((v) => v.trim())
              .filter(Boolean),
          },
        }),
      });
      setDirty(false);
      await onSaved();
      notify("平台设置已保存");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fields: [keyof Platform, string, number][] = [
    ["pointsPerYuan", "每 1 元兑换积分", 1],
    ["minRechargeFen", "最低充值金额（分）", 1],
    ["maxRechargeFen", "最高充值金额（分）", 1],
    ["mixPoints", "单次混剪积分", 0],
    ["alarmFailures", "每小时失败告警阈值", 1],
    ["alarmQueueMinutes", "排队告警阈值（分钟）", 1],
  ];
  return (
    <form
      className="edit-form panel"
      onSubmit={save}
      onChange={() => setDirty(true)}
      data-unsaved={dirty || busy || undefined}
      aria-busy={busy}
    >
      <h2>业务设置</h2>
      <div className="form-grid">
        {fields.map(([key, label, min]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              disabled={busy}
              min={min}
              step={key === "mixPoints" ? "0.01" : "1"}
              value={Number(value[key])}
              onChange={(e) => patch({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        {(["rewriteModel", "ttsModel"] as const).map((key) => (
          <label key={key}>
            {key === "rewriteModel" ? "AI 改写模型" : "AI 配音模型"}
            <select
              disabled={busy}
              value={value[key]}
              onChange={(e) => patch({ [key]: e.target.value })}
            >
              <option value="">请选择已上架的模型</option>
              {models
                .filter(
                  (m) =>
                    m.data.published &&
                    (key === "rewriteModel"
                      ? m.data.kind === "chat"
                      : m.data.kind === "audio" &&
                        m.data.key.startsWith("tts-")),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.data.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <label>
        推荐搜索词（每行一条）
        <textarea
          disabled={busy}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
      </label>
      <label>
        帮助与联系说明
        <textarea
          disabled={busy}
          value={value.supportText}
          maxLength={500}
          onChange={(e) => patch({ supportText: e.target.value })}
        />
      </label>
      {(
        [
          ["billingEnabled", "启用生成积分扣减"],
          ["rechargeEnabled", "启用微信充值"],
          ["reviewRequired", "公开分享前需要人工审核"],
        ] as const
      ).map(([key, label]) => (
        <label className="checkbox" key={key}>
          <input
            type="checkbox"
            disabled={busy}
            checked={value[key]}
            onChange={(e) => patch({ [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          {busy ? "保存中…" : "保存设置"}
        </button>
      </div>
    </form>
  );
}
