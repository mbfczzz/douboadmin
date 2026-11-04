import type { Row } from "../api";
import Modal from "../components/Modal";
import Records, { useRecords } from "./Records";
import type { Partner } from "./types";
export default function Picker({
  owner,
  onChoose,
  onClose,
}: {
  owner?: string;
  onChoose: (id: string, row?: Row<Partner>) => void;
  onClose: () => void;
}) {
  const resource = useRecords<Partner>(
    "/admin/partners" + (owner ? "?owner=" + encodeURIComponent(owner) : ""),
  );
  return (
    <Modal
      title={owner ? "选择直接下级服务商" : "切换服务商"}
      onClose={onClose}
      className="partner-dialog"
    >
      <div className="edit-form">
        {!owner && (
          <button className="secondary" onClick={() => onChoose("root")}>
            总账号
          </button>
        )}
        <Records
          resource={resource}
          columns={[
            {
              title: "服务商",
              render: (r) => (
                <>
                  {r.data.name}
                  <small className="cell-note">{r.id}</small>
                </>
              ),
            },
            {
              title: "操作",
              action: true,
              render: (r: Row<Partner>) => (
                <button onClick={() => onChoose(r.id, r)}>选择</button>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}
