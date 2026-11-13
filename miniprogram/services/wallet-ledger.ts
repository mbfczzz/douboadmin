import { date } from "../utils/ui";
import { points } from "./business";
import type { Row } from "./types";

import type { Ledger } from "./ledger-types";
export type { Ledger } from "./ledger-types";

const labels: Record<string, string> = {
  topup: "充值到账",
  admin_adjust: "管理员调整",
  job_hold: "任务预留",
  job_charge: "生成扣减",
  job_release: "失败退回",
  refund_hold: "退款预留",
  refund_complete: "退款回收",
  refund_cancel: "退款关闭",
};

export function ledgerView(row: Row<Ledger>) {
  const entry = row.data,
    settling = entry.kind === "job_charge" || entry.kind === "refund_complete";
  return {
    icon: entry.kind === "topup" ? "add-circle" : entry.kind.includes("hold") ? "lock-on" : entry.kind.includes("release") || entry.kind.includes("refund") ? "rollback" : entry.kind === "admin_adjust" ? "setting" : "image",
    id: row.id,
    title: labels[entry.kind] || entry.kind,
    note:
      entry.kind === "job_charge"
        ? entry.note + "（从预留结算，不再扣减可用积分）"
        : entry.note,
    change: settling
      ? "结算 " + points(-entry.heldDelta)
      : (entry.availableDelta > 0 ? "+" : "") + points(entry.availableDelta),
    tone: !settling && entry.availableDelta > 0 ? "plus" : "",
    time: date(row.createdAt),
  };
}
