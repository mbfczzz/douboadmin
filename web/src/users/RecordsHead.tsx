import type { Row } from "../api";
import { IdChip } from "../components/Tag";
import type { Profile } from "../business/types";

// Who the records belong to, at the top of both record dialogs.
export default function RecordsHead({ user }: { user: Row<Profile> }) {
  const name = user.data.nickname || "微信用户";
  return (
    <header className="records-head">
      <span className="avatar records-avatar" aria-hidden="true">
        {name[0]}
      </span>
      <div>
        <b>{name}</b>
        <span className="quiet">
          {[user.data.name, user.data.phone].filter(Boolean).join(" · ") ||
            "未填写姓名和手机号"}
        </span>
      </div>
      <IdChip>{user.id}</IdChip>
    </header>
  );
}
