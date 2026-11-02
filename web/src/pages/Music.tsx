import { useState, type FormEvent } from "react";
import { api, type Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import type { Music as Track } from "../business/types";
import Modal from "../components/Modal";

export default function Music({ notify }: PageProps) {
  const resource = useResource<Row<Track>[]>("/admin/music"),
    [edit, setEdit] = useState<Row<Track> | null>(null),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit || busy) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      let assetId = edit.data.assetId;
      const file = form.get("file");
      if (file instanceof File && file.size) {
        const data = new FormData();
        data.append("file", file);
        const asset = await api<Row>("/admin/assets", {
          method: "POST",
          body: data,
        });
        assetId = asset.id;
      }
      await api("/admin/music/" + edit.id, {
        method: "PUT",
        body: JSON.stringify({
          version: edit.version,
          data: {
            title: String(form.get("title")),
            assetId,
            published: form.has("published"),
            sort: Number(form.get("sort")),
          },
        }),
      });
      setEdit(null);
      await resource.reload();
      notify("背景音乐已保存");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourcePage
      page="music"
      resource={resource}
      actions={
        <button
          className="primary"
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              version: 0,
              createdAt: "",
              data: { title: "", assetId: "", published: false, sort: 0 },
            })
          }
        >
          新增音乐
        </button>
      }
    >
      <Table
        rows={resource.data || []}
        id={(r) => r.id}
        columns={[
          { title: "名称", render: (r) => r.data.title },
          {
            title: "试听",
            render: (r) => <audio controls preload="none" src={r.data.url} />,
          },
          {
            title: "状态",
            render: (r) => (r.data.published ? "已上架" : "已下架"),
          },
          {
            title: "操作",
            action: true,
            render: (r) => <button onClick={() => setEdit(r)}>编辑</button>,
          },
        ]}
      />
      {edit && (
        <Modal
          title="背景音乐"
          className="form-modal"
          onClose={() => !busy && setEdit(null)}
        >
          <form className="edit-form" onSubmit={save}>
            <div className="form-body">
              <label>
                名称
                <input
                  name="title"
                  defaultValue={edit.data.title}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                音频文件
                <input
                  type="file"
                  name="file"
                  accept="audio/mpeg,audio/wav"
                  required={!edit.data.assetId}
                />
              </label>
              <label>
                排序
                <input
                  type="number"
                  name="sort"
                  min={0}
                  defaultValue={edit.data.sort}
                />
              </label>
              <label className="checkbox">
                <input
                  name="published"
                  type="checkbox"
                  defaultChecked={edit.data.published}
                />
                上架到小程序
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                {busy ? "保存中…" : "保存音乐"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </ResourcePage>
  );
}
