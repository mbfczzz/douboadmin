import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { api, type Model, type Row } from "../api";
import Modal from "../components/Modal";
import { useResource } from "../hooks/useResource";
import { ask } from "../confirm/ask";
import { modelKinds } from "./settings";
import "./order.css";

export default function ModelOrder({
  kind,
  disabled,
  onSaved,
}: {
  kind: string;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <GripVertical size={15} />
        拖动排序
      </button>
      {open && (
        <OrderDialog
          initialKind={kind}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function OrderDialog({
  initialKind,
  onClose,
  onSaved,
}: {
  initialKind: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Fetch the complete catalog, so reordering is not restricted to the current page/search.
  const resource = useResource<Row<Model>[]>("/admin/models");
  const [draft, setDraft] = useState<Row<Model>[]>();
  const [kind, setKind] = useState(initialKind);
  const [dragged, setDragged] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rows = draft || resource.data || [];
  const visible = rows.filter((row) => !kind || row.data.kind === kind);
  const changed =
    !!draft && draft.some((row, i) => row.id !== resource.data?.[i]?.id);

  function move(from: string, to: string) {
    if (saving || from === to) return;
    const start = visible.findIndex((row) => row.id === from);
    const end = visible.findIndex((row) => row.id === to);
    if (start < 0 || end < 0) return;
    const reordered = [...visible];
    reordered.splice(end, 0, ...reordered.splice(start, 1));
    let index = 0;
    // A type filter only rearranges that type's slots; other types retain their order.
    setDraft(
      rows.map((row) =>
        !kind || row.data.kind === kind ? reordered[index++] : row,
      ),
    );
  }

  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    setError("");
    try {
      const approved = await ask({
        title: "保存模型排序？",
        message: "保存后，小程序将按此顺序展示可用模型，越靠前越先显示。",
        confirmText: "确认保存",
      });
      if (approved === false) return;
      await api("/admin/models/order", {
        method: "PUT",
        confirmation: false,
        body: JSON.stringify({
          items: rows.map(({ id, version, createdAt }) => ({
            id,
            version,
            createdAt,
          })),
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="模型排序"
      onClose={() => {
        if (!saving) onClose();
      }}
      className="model-order"
      subtitle="拖动左侧手柄调整顺序，越靠前，在小程序中越先显示。"
    >
      <div className="model-order-toolbar">
        <select
          aria-label="排序模型类型"
          value={kind}
          disabled={saving}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">全部模型</option>
          {Object.entries(modelKinds).map(([id, label]) => (
            <option key={id} value={id}>
              {label}模型
            </option>
          ))}
        </select>
        <span className="quiet">共 {visible.length} 个 · 包含所有分页</span>
      </div>
      <div className="model-order-list">
        {resource.loading && <p role="status">正在加载模型…</p>}
        {resource.error && <p role="alert">{resource.error}</p>}
        {!resource.loading && !resource.error && !visible.length && (
          <p>暂无可排序的模型</p>
        )}
        <ol
          aria-label="模型展示顺序"
          onDragEnd={() => {
            setDragged("");
            setTarget("");
          }}
        >
          {visible.map((row, i) => (
            <li
              key={row.id}
              data-model-id={row.id}
              className={
                target === row.id && dragged !== row.id ? "drop-target" : ""
              }
              onDragOver={(e) => {
                if (!dragged || saving) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setTarget(row.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                move(dragged, row.id);
                setDragged("");
                setTarget("");
              }}
            >
              <button
                className="icon model-order-grip"
                draggable={!saving}
                disabled={saving}
                aria-label={`拖动 ${row.data.name}`}
                title="拖动排序，也可使用右侧上下移动按钮"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", row.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragged(row.id);
                }}
              >
                <GripVertical size={18} />
              </button>
              <span className="quiet">{i + 1}</span>
              <div className="model-order-name">
                <b>{row.data.name}</b>
                <small className="quiet">
                  {modelKinds[row.data.kind] || row.data.kind} ·{" "}
                  {row.data.published && row.data.available
                    ? "已上架"
                    : "未上架或不可用"}
                </small>
              </div>
              <button
                className="icon"
                aria-label={`上移 ${row.data.name}`}
                disabled={saving || i === 0}
                onClick={() => move(row.id, visible[i - 1].id)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon"
                aria-label={`下移 ${row.data.name}`}
                disabled={saving || i === visible.length - 1}
                onClick={() => move(row.id, visible[i + 1].id)}
              >
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      {error && (
        <p className="model-order-error" role="alert">
          {error}。请重新加载列表后重试。
        </p>
      )}
      <footer>
        <button
          className="secondary"
          disabled={saving || resource.loading}
          onClick={() => {
            setDraft(undefined);
            setError("");
            void resource.reload();
          }}
        >
          重新加载
        </button>
        <button className="secondary" disabled={saving} onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={saving || !changed || resource.loading || !!resource.error}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : "保存排序"}
        </button>
      </footer>
    </Modal>
  );
}
