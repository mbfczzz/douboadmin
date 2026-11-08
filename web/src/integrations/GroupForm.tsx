import { useEffect, useState, type FormEvent } from "react";
import { api, APIError } from "../api";
import type { Notify } from "../navigation";
import Badge from "../components/Badge";
import Fields from "./Fields";
import type { IntegrationGroup } from "./types";

const initial = (group: IntegrationGroup) =>
  Object.fromEntries(
    group.fields.map((f) => [f.key, group.values[f.key] || ""]),
  );

export default function GroupForm({
  group,
  reload,
  notify,
}: {
  group: IntegrationGroup;
  reload: () => Promise<void>;
  notify: Notify;
}) {
  const [values, setValues] = useState(() => initial(group));
  const [version, setVersion] = useState(group.version);
  const [reset, setReset] = useState(0);
  const [clear, setClear] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [errorField, setErrorField] = useState("");
  const message =
    error ||
    (group.version !== version && dirty
      ? "配置已更新，请重新读取后核对。"
      : group.validation);
  useEffect(() => {
    if (group.version !== version && !dirty) {
      restore();
    }
  }, [group, version, dirty]);
  function restore() {
    setValues(initial(group));
    setVersion(group.version);
    setClear({});
    setError("");
    setErrorField("");
    setReset((n) => n + 1);
  }
  function change(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setErrorField("");
  }
  async function discard() {
    setDirty(false);
    restore();
    await reload();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    setErrorField("");
    try {
      await api("/admin/integrations/" + group.id, {
        method: "PUT",
        confirmation: {
          title: `确认修改${group.name}`,
          before: group.values,
          labels: Object.fromEntries(group.fields.map((f) => [f.key, f.label])),
          secrets: group.fields
            .filter((f) => f.kind === "secret")
            .map((f) => f.key),
        },
        body: JSON.stringify({
          version,
          values,
          clear: Object.keys(clear).filter((key) => clear[key]),
        }),
      });
      setDirty(false);
      setValues(initial({ ...group, values }));
      setClear({});
      await reload();
      notify("已保存，重启服务后生效");
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof APIError) setErrorField(e.field || "");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel integration">
      <summary>
        <b>{group.name}</b>
        {group.pendingRestart ? (
          <Badge state="queued" label="已保存 · 待重启" />
        ) : group.source === "database" ? (
          <Badge state="succeeded" label="数据库配置" />
        ) : (
          <Badge state="muted" label="服务器配置" />
        )}
      </summary>
      <form
        className="edit-form"
        onSubmit={save}
        data-unsaved={dirty || busy || undefined}
        aria-busy={busy}
      >
        <p className="quiet">{group.hint}</p>
        {message && (
          <p className={error ? "error" : "notice warning"} role="alert">
            {message}
          </p>
        )}
        <Fields
          key={reset}
          group={group}
          values={values}
          clear={clear}
          disabled={busy}
          errorField={errorField}
          change={change}
          clearSecret={(key, enabled) => {
            setClear((v) => ({ ...v, [key]: enabled }));
            change(key, "");
          }}
        />
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void discard()}
          >
            重新读取
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存配置"}
          </button>
        </div>
      </form>
    </details>
  );
}
