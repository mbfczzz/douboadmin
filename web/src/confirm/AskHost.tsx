import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Modal from "../components/Modal";
import { bindAsk, finishAsk, type AskOptions } from "./ask";
import "./ask.css";

// Renders the current ask() request as a small themed dialog.
export default function AskHost() {
  const current = useRef<AskOptions | undefined>(undefined);
  const [options, setOptions] = useState<AskOptions>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () =>
      bindAsk((next) => {
        current.current = next;
        setReason("");
        setError("");
        setBusy(false);
        setOptions(next);
      }),
    [],
  );
  if (!options) return null;
  const close = () => !busy && finishAsk(false, options);
  async function confirm(value: string) {
    if (!options?.run) return finishAsk(value, options);
    setBusy(true);
    setError("");
    try {
      await options.run(value);
      finishAsk(value, options);
    } catch (e) {
      // An empty message means the change summary was cancelled.
      if (current.current === options) setError((e as Error).message);
    } finally {
      if (current.current === options) setBusy(false);
    }
  }
  const min = options.reason?.minLength || 0,
    valid = !options.reason || reason.trim().length >= Math.max(1, min);
  return (
    <Modal
      className="form-modal ask-dialog"
      title={options.title}
      onClose={close}
    >
      <form
        className="edit-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void confirm(options.reason ? reason.trim() : "");
        }}
      >
        <div className="form-body">
          <div className={"ask-message" + (options.danger ? " is-danger" : "")}>
            {options.danger && <TriangleAlert size={18} aria-hidden="true" />}
            <div>{options.message}</div>
          </div>
          {options.reason && (
            <label>
              {options.reason.label}
              <textarea
                autoFocus
                value={reason}
                disabled={busy}
                maxLength={options.reason.maxLength || 200}
                placeholder={options.reason.placeholder}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby={min > 1 ? "ask-reason-hint" : undefined}
              />
            </label>
          )}
          {options.reason && min > 1 && (
            <small id="ask-reason-hint" className="quiet ask-hint">
              至少 {min} 个字
            </small>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button
            className={options.danger ? "primary danger" : "primary"}
            disabled={!valid || busy}
            autoFocus={!options.reason}
          >
            {busy ? "处理中…" : options.confirmText || "确认"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
