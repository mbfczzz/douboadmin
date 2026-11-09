import { date } from "../api";
import Tag from "../components/Tag";
import { kindNames, points } from "../business/types";
import type { ModelUse } from "./records";
import "../components/usage-bar.css";

// One row per model: calls split into succeeded / failed / running.
export default function ModelUsage({ models }: { models: ModelUse[] }) {
  return (
    <ul className="model-usage">
      {models.map((m) => {
        const part = (n: number) => `${(n / (m.calls || 1)) * 100}%`;
        return (
          <li key={m.model}>
            <span className="model-initial" aria-hidden="true">
              {(m.name || m.model)[0]?.toUpperCase()}
            </span>
            <div className="model-usage-main">
              <div className="model-usage-title">
                <b>{m.name || m.model}</b>
                <Tag>{kindNames[m.kind] || m.kind}</Tag>
                <span className="quiet mono">{m.model}</span>
              </div>
              <div
                className="usage-bar"
                role="img"
                aria-label={`成功 ${m.succeeded}，失败 ${m.failed}，进行中 ${m.active}`}
              >
                <i className="ok" style={{ width: part(m.succeeded) }} />
                <i className="bad" style={{ width: part(m.failed) }} />
                <i className="run" style={{ width: part(m.active) }} />
              </div>
              <span className="usage-legend quiet">
                <i className="ok" />
                成功 {m.succeeded}
                <i className="bad" />
                失败 {m.failed}
                {m.active > 0 && (
                  <>
                    <i className="run" />
                    进行中 {m.active}
                  </>
                )}
                <span>最近 {date(m.lastAt)}</span>
              </span>
            </div>
            <div className="model-usage-figures">
              <b>{m.calls}</b>
              <span className="quiet">次</span>
              <b>{points(m.pointsUnits)}</b>
              <span className="quiet">积分</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
