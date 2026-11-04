import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Row, Model } from "../api";
import { useRecordSave } from "../hooks/useRecordSave";
import Modal from "./Modal";
import BasicFields from "../models/BasicFields";
import Capabilities from "../models/Capabilities";
import PromptFields from "../models/PromptFields";
import PricingFields from "../models/PricingFields";
import { ErrorFields, StatusFields } from "../models/StatusFields";
import { modelDraft, type ModelSettings } from "../models/settings";
import { canLeave } from "../hooks/unsaved";
export { modelKinds, supportedModel } from "../models/settings";
export { default as ModelImport } from "./ModelImport";

export default function ModelEditor({
  row,
  onClose,
  onSaved,
}: {
  row: Row<Model>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [model, setModel] = useState(() => modelDraft(row.data)),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const record = useRecordSave("models", row),
    errorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (record.error) errorRef.current?.focus();
  }, [record.error]);
  function close() {
    if (!busy && canLeave()) onClose();
  }
  function patch(value: Partial<ModelSettings>) {
    setModel((m) => ({ ...m, settings: { ...m.settings, ...value } }));
    setDirty(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (await record.save(model)) {
        onSaved();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`配置模型 · ${row.data.name}`}
      subtitle="基础信息 · 生成能力 · 积分定价（每个模型独立配置，同步至小程序创作页）"
      className="model-config"
      onClose={close}
    >
      <form
        className="model-config-form"
        onSubmit={save}
        onChange={() => setDirty(true)}
        aria-busy={busy}
        data-unsaved={dirty || busy || undefined}
      >
        <div className="model-config-body">
          <fieldset
            disabled={busy}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            <BasicFields
              model={model}
              onChange={(m) => {
                setModel(m);
                setDirty(true);
              }}
            />
            <Capabilities model={model} onChange={patch} />
            <PromptFields model={model} onChange={patch} />
            <PricingFields model={model} onChange={patch} />
            <ErrorFields model={model} onChange={patch} />
            <StatusFields
              model={model}
              onChange={(m) => {
                setModel(m);
                setDirty(true);
              }}
            />
          </fieldset>
        </div>
        <footer className="model-config-footer">
          {record.error ? (
            <span
              ref={errorRef}
              tabIndex={-1}
              className="config-error"
              role="alert"
            >
              {record.error}
            </span>
          ) : (
            <span>变更将在保存后同步到小程序</span>
          )}
          <button
            type="button"
            className="config-ghost"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button className="config-save" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
