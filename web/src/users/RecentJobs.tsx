import { useState } from "react";
import { date, stateText } from "../api";
import { points } from "../business/types";
import { billingNames } from "../generation/types";
import type { ModelJob } from "./records";

// The latest generations as a compact list; 20 at a time.
export default function RecentJobs({
  jobs,
  onOpen,
}: {
  jobs: ModelJob[];
  onOpen?: (id: string) => void;
}) {
  const [shown, setShown] = useState(20);
  return (
    <>
      <ul className="recent-jobs">
        {jobs.slice(0, shown).map((j) => (
          <li key={j.id} className={"job-" + j.status}>
            <span className="job-state">
              <i aria-hidden="true" />
              {stateText[j.status] || j.status}
            </span>
            <div className="job-main">
              <span className="job-meta quiet">
                {date(j.createdAt)} · {j.name || j.model}
              </span>
              <span className="job-prompt">{j.prompt || "（无提示词）"}</span>
              {j.error && <span className="job-error">{j.error}</span>}
            </div>
            <span className="job-points">
              {points(j.pointsUnits)}
              <small className="quiet">
                {j.billing && j.billing !== "charged"
                  ? billingNames[j.billing] || j.billing
                  : "积分"}
              </small>
            </span>
            {onOpen && (
              <button
                type="button"
                className="link-button"
                onClick={() => onOpen(j.id)}
              >
                详情
              </button>
            )}
          </li>
        ))}
      </ul>
      {jobs.length > shown && (
        <button
          type="button"
          className="secondary records-more"
          onClick={() => setShown(shown + 20)}
        >
          显示更多（还有 {jobs.length - shown} 条）
        </button>
      )}
    </>
  );
}
