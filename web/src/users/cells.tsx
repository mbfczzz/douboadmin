import { date, type Row } from "../api";
import Tag from "../components/Tag";
import type { Profile } from "../business/types";
import { phoneVerified, registered } from "./registration";

// Table cells for the 小程序用户 list, kept narrow enough for 1280px screens.

// Name and phone; only an unverified phone is flagged (nearly all are verified).
export const nameCell = (r: Row<Profile>) => (
  <>
    {r.data.name || "未填写"}
    <small className="cell-note mono">
      {r.data.phone || "未填写"}
      {r.data.phone && !phoneVerified(r.data) && (
        <span className="user-unverified">未验证</span>
      )}
    </small>
  </>
);

// How the user got access; the note adds only what the tag does not say.
export const accessCell = (r: Row<Profile>) => {
  const a = r.data.access,
    note = !registered(r.data)
      ? "待完成注册"
      : a?.active || a?.status === "review"
        ? a?.partnerName
        : a?.status !== "pending"
          ? a?.message
          : "";
  return (
    <>
      {a?.active ? (
        a.status === "provider" ? (
          <Tag tone="info">服务商负责人</Tag>
        ) : (
          <Tag tone="accent">会员</Tag>
        )
      ) : a?.status === "review" ? (
        <Tag tone="warning">待开通</Tag>
      ) : (
        <Tag>未开通</Tag>
      )}
      {note && <small className="cell-note">{note}</small>}
    </>
  );
};

// Date over time, so the column stays narrow.
export const createdCell = (r: { createdAt: string }) => {
  const [day, time] = date(r.createdAt).split(" ");
  return (
    <>
      {day}
      {time && <small className="cell-note">{time}</small>}
    </>
  );
};
