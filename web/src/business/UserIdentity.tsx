import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type Row } from "../api";
import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
import type { Notify } from "../navigation";
import type { Profile } from "./types";
import type { Partner } from "../partners/types";

type Identity = {
  version: number;
  kind: string;
  partnerId?: string;
  parentId?: string;
  hasChildren?: boolean;
  previousKind?: string;
  previousPartnerId?: string;
  previousParentId?: string;
  memberPartnerId?: string;
  providerKind?: string;
  providerPartnerId?: string;
  providerParentId?: string;
};

const names: Record<string, string> = {
  branch: "分公司",
  visitor: "游客",
  member: "合伙人",
  s1: "一级服务商",
  s2: "二级服务商",
};

export default function UserIdentity({
  user,
  onClose,
  onSaved,
  notify,
}: {
  user: Row<Profile>;
  onClose: () => void;
  onSaved: () => unknown;
  notify: Notify;
}) {
  const identity = useResource<Identity>(`/admin/users/${user.id}/business-identity`),
    tree = useResource<Row<Partner>[]>("/admin/partners/tree"),
    [kind, setKind] = useState("visitor"),
    [parent, setParent] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!identity.data) return;
    setKind(identity.data.kind || "visitor");
    setParent(identity.data.parentId || identity.data.partnerId || "");
  }, [identity.data]);
  const parents = useMemo(() => {
    const active = (tree.data || []).filter((row) => row.data.status === "active");
    if (kind === "member") return active.filter((row) => ["branch", "s1", "s2"].includes(row.data.role));
    if (kind === "s1") return active.filter((row) => row.data.role === "branch");
    if (kind === "s2") return active.filter((row) => ["branch", "s1"].includes(row.data.role));
    return [];
  }, [tree.data, kind]);
  const targetKinds = identity.data?.providerKind
    ? ["visitor", "member", identity.data.providerKind]
    : ["visitor", "member", "s1", "s2"];
  const chooseKind = (next: string) => {
    setKind(next);
    if (next === "visitor") return setParent("");
    const saved = next === "member" ? identity.data?.memberPartnerId : identity.data?.providerKind === next ? identity.data.providerParentId : "";
    setParent(saved || (next === "member" ? "root" : ""));
  };
  const restore = () => {
    const previous = identity.data?.previousKind;
    if (!previous) return;
    setKind(previous);
    setParent(previous === "member" ? identity.data?.previousPartnerId || "root" : identity.data?.previousParentId || "");
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!identity.data || busy) return;
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/business-identity`, {
        method: "PUT",
        confirmation: {
          title: `确认将用户调整为${names[kind]}`,
          before: { kind: identity.data.kind, parentId: identity.data.parentId || identity.data.partnerId || "" },
          labels: { kind: "业务身份", parentId: "上级" },
          format: { kind: (value) => names[String(value)] || String(value) },
        },
        body: JSON.stringify({ version: identity.data.version, kind, parentId: parent }),
      });
      await onSaved();
      notify(`用户身份已调整为${names[kind]}`);
      onClose();
    } catch (error) {
      notify((error as Error).message, "error");
      void identity.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal className="form-modal" title="调整业务身份" subtitle={user.data.name || user.data.nickname} onClose={onClose}>
      <RequestState loading={identity.loading || tree.loading} error={identity.error || tree.error} retry={() => { void identity.reload(); void tree.reload(); }} />
      {identity.data && tree.data && (
        identity.data.kind === "branch" ? (
          <div className="form-body"><p className="quiet">分公司不参与身份转换，请在服务商管理中维护。</p></div>
        ) : (
        <form className="edit-form" onSubmit={save} aria-busy={busy}>
          <div className="form-body">
            <p className="quiet">当前身份：{names[identity.data.kind] || identity.data.kind}</p>
            {identity.data.previousKind && <button type="button" className="secondary" onClick={restore}>恢复原身份：{names[identity.data.previousKind]}</button>}
            <label>目标身份<select value={kind} disabled={busy} onChange={(e) => chooseKind(e.target.value)}>{targetKinds.map((value) => <option key={value} value={value}>{names[value]}</option>)}</select></label>
            {kind !== "visitor" && <label>上级<select value={parent} required disabled={busy} onChange={(e) => setParent(e.target.value)}><option value="">请选择上级</option>{kind === "member" && <option value="root">总账号（无服务商上游）</option>}{parents.map((row) => <option key={row.id} value={row.id}>{row.data.name} · {names[row.data.role] || row.data.role}</option>)}</select></label>}
            {identity.data.providerPartnerId && <p className="quiet">原服务商关系会保留；恢复服务商时使用原层级和原上级。转为游客会同步暂停后台登录账号。</p>}
          </div>
          <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "保存中…" : "确认调整"}</button></div>
        </form>
        )
      )}
    </Modal>
  );
}
