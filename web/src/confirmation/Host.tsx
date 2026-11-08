import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../components/Modal";
import {
  bindConfirmation,
  finishConfirmation,
  type ConfirmationPlan,
} from "./request";
import "./confirmation.css";

export default function ConfirmationHost() {
  const [plan, setPlan] = useState<ConfirmationPlan>();
  useEffect(() => bindConfirmation(setPlan), []);
  useEffect(() => {
    if (!plan) return;
    const app = document.querySelector<HTMLElement>(".app");
    if (!app) return;
    const previous = app.inert;
    app.inert = true;
    return () => {
      app.inert = previous;
    };
  }, [plan]);
  if (!plan) return null;
  return createPortal(
    <Modal
      title={plan.title}
      className="save-confirmation"
      onClose={() => finishConfirmation(false)}
    >
      <form
        data-unsaved
        aria-busy="true"
        onSubmit={(e) => {
          e.preventDefault();
          finishConfirmation(true);
        }}
      >
        <div className="confirmation-body">
          <p>请核对本次修改，确认后提交保存。</p>
          {plan.warning && <p className="notice warning">{plan.warning}</p>}
          {plan.rows.length ? (
            <dl>
              {plan.rows.map((row, i) => (
                <div key={i}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.before !== undefined && (
                      <>
                        <small>修改前</small>
                        <pre>{row.before}</pre>
                      </>
                    )}
                    <small>
                      {row.before === undefined ? "提交内容" : "修改后"}
                    </small>
                    <pre>{row.after}</pre>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="quiet">将保存当前配置。</p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => finishConfirmation(false)}
          >
            返回修改
          </button>
          <button className="primary">确认提交</button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
