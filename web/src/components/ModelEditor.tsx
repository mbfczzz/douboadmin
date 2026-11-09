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
import { modelSections, type ModelSection } from "../models/sections";
import "../styles/model-config.css";
export { modelKinds, supportedModel } from "../models/settings";
export { default as ModelImport } from "./ModelImport";

export default function ModelEditor({
  row,
  section,
  onClose,
  onSaved,
}: {
  row: Row<Model>;
  section: ModelSection;
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
    if (!busy) void canLeave().then((ok) => ok && onClose());
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
      title={`${modelSections[section].title} · ${row.data.name}`}
      subtitle="保存后同步至小程序创作页"
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
          <fieldset disabled={busy}>
            {section === "basic" && (
              <BasicFields
                model={model}
                onChange={(m) => {
                  setModel(m);
                  setDirty(true);
                }}
              />
            )}
            {section === "capabilities" && (
              <Capabilities model={model} onChange={patch} />
            )}
            {section === "prompt" && (
              <PromptFields model={model} onChange={patch} />
            )}
            {section === "pricing" && (
              <PricingFields model={model} onChange={patch} />
            )}
            {section === "status" && (
              <>
                <StatusFields
                  model={model}
                  onChange={(m) => {
                    setModel(m);
                    setDirty(true);
                  }}
                />
                <ErrorFields model={model} onChange={patch} />
              </>
            )}
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
            className="secondary"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
