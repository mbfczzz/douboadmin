import { useState } from "react";
import Modal from "../components/Modal";
import { canLeave } from "../hooks/unsaved";
import type { Notify } from "../navigation";
import PolicyForm from "./PolicyForm";
import "./editor.css";

// The platform-wide distribution policy, which belongs to no provider row.
export default function PlatformActions({
  notify,
  changed,
}: {
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const close = () => void canLeave().then((ok) => ok && setOpen(false));
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        分销规则
      </button>
      {open && (
        <Modal
          title="分销规则"
          subtitle="售价与各级分佣"
          className="partner-editor"
          style={{ width: "min(1040px, 100%)" }}
          onClose={close}
        >
          <div className="provider-panel">
            <PolicyForm notify={notify} changed={changed} />
          </div>
        </Modal>
      )}
    </>
  );
}
