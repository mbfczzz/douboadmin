import { useState } from "react";
import ErrorRuleEditor from "./ErrorRuleEditor";
import { suggestedFragment } from "./types";
import "./errors.css";
import type { Notify } from "../navigation";

// Under a failed generation: what its user reads, and 归档此错误 to give
// users the right words for this upstream failure from now on.
export default function UserFailure({
  publicError,
  cause,
  onFiled,
  notify,
}: {
  publicError?: { message: string; action?: string } | null;
  cause?: string;
  onFiled: () => void;
  notify: Notify;
}) {
  const [open, setOpen] = useState(false);
  if (!publicError) return null;
  return (
    <div className="gen-public-error">
      <p>
        <span className="quiet">用户看到：</span>
        {publicError.message}
        {publicError.action ? ` · ${publicError.action}` : ""}
      </p>
      {cause && (
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen(true)}
        >
          归档此错误
        </button>
      )}
      {open && cause && (
        <ErrorRuleEditor
          initial={{
            id: "",
            version: 0,
            createdAt: "",
            data: {
              contains: suggestedFragment(cause),
              message: "",
              action: "",
            },
          }}
          cause={cause}
          notify={notify}
          onClose={() => setOpen(false)}
          onSaved={onFiled}
        />
      )}
    </div>
  );
}
