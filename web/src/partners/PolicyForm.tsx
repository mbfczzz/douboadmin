import type { Row } from "../api";
import { useEffect, useRef, useState } from "react";
import { canLeave } from "../hooks/unsaved";
import { useResource } from "../hooks/useResource";
import RequestState from "../components/RequestState";
import type { Policy } from "./types";
import { hundredths } from "./types";
import { useCommand } from "./useCommand";
import type { Notify } from "../navigation";
export default function PolicyForm({
  notify,
  changed,
}: {
  notify: Notify;
  changed: () => Promise<void>;
}) {
  const resource = useResource<Row<Policy>>("/admin/partner-policy"),
    command = useCommand();
  const [dirty, setDirty] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const busy = command.busy || resource.loading;
  useEffect(() => {
    form.current?.reset();
    setDirty(false);
  }, [resource.data]);
  return (
    <section className="panel partner-policy">
      <h3>总账号价格与分佣规则</h3>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={() => {
          if (canLeave()) void resource.reload();
        }}
      />
      {resource.data && (
        <form
          ref={form}
          data-unsaved={dirty || busy || undefined}
          aria-busy={busy}
          onChange={() => setDirty(true)}
          key={resource.data.version}
          className="edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const f = new FormData(e.currentTarget);
            try {
              await command.send(
                "/admin/partner-policy",
                {
                  version: resource.data!.version,
                  data: {
                    enabled: !!f.get("enabled"),
                    costPer100Fen: hundredths(f.get("cost")),
                    rootMarginBps: hundredths(f.get("margin")),
                    totalUserQuota: Number(f.get("totalUserQuota")),
                  },
                },
                "PUT",
              );
              setDirty(false);
              await resource.reload();
              await changed();
              notify("价格规则已保存，历史订单快照不变");
            } catch (e) {
              notify((e as Error).message, "error");
            }
          }}
        >
          <div className="partner-form-grid">
            <label>
              平台用户总额度
              <input
                disabled={busy}
                type="number"
                name="totalUserQuota"
                min="0"
                max="1000000"
                step="1"
                defaultValue={resource.data.data.totalUserQuota || 0}
                required
              />
            </label>
            <label>
              每 100 元基准算力成本（元）
              <input
                disabled={busy}
                type="number"
                name="cost"
                min="0"
                max="100"
                step="0.01"
                defaultValue={resource.data.data.costPer100Fen / 100}
                required
              />
            </label>
            <label>
              总账号保留毛利（%）
              <input
                disabled={busy}
                type="number"
                name="margin"
                min="0"
                max="100"
                step="0.01"
                defaultValue={resource.data.data.rootMarginBps / 100}
                required
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              disabled={busy}
              name="enabled"
              type="checkbox"
              defaultChecked={resource.data.data.enabled}
            />{" "}
            已确认成本与价格，启用按充值分佣
          </label>
          <p className="muted">
            示例成本 80、总账号保留 50% 毛利，则 S1 进价为 90；S1
            再保留剩余毛利的 50%，S2 进价为
            95。用户售价改变时按比例折算积分和分佣，金额以订单快照为准。
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存分佣规则"}
          </button>
        </form>
      )}
    </section>
  );
}
