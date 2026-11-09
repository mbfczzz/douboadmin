import { useState } from "react";
import Modal from "../components/Modal";
import { canLeave } from "../hooks/unsaved";
import type { Notify } from "../navigation";
import PolicyForm from "./PolicyForm";
import QuotaRequests from "./QuotaRequests";

// Platform-wide functions that belong to no single provider row: the
// distribution policy and the approval inbox for all quota requests.
export default function PlatformActions({
  notify,
  changed,
}: {
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const [open, setOpen] = useState<"policy" | "requests">();
  const close = () => void canLeave().then((ok) => ok && setOpen(undefined));
  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen("requests")}
      >
        名额申请审批
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen("policy")}
      >
        分销规则
      </button>
      {open && (
        <Modal
          title={open === "policy" ? "分销规则" : "名额申请审批"}
          subtitle={
            open === "policy"
              ? "平台用户总额度、售价与各级分佣"
              : "全部服务商的名额申请"
          }
          className="partner-editor"
          style={{ width: "min(1040px, 100%)" }}
          onClose={close}
        >
          <div className="provider-panel">
            {open === "policy" ? (
              <PolicyForm notify={notify} changed={changed} />
            ) : (
              <QuotaRequests id="root" notify={notify} changed={changed} />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
