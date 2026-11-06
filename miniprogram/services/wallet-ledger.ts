import { date } from "../utils/ui";
import { points } from "./business";
import type { Row } from "./types";

export interface Ledger {
  kind: string;
  availableDelta: number;
  heldDelta: number;
  note: string;
  availableAfter: number;
}

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
    id: row.id,
    title: labels[entry.kind] || entry.kind,
    note:
      entry.kind === "job_charge"
        ? entry.note + "（从预留结算，不再扣减可用积分）"
        : entry.note,
    change: settling
      ? "结算 " + points(-entry.heldDelta)
      : (entry.availableDelta > 0 ? "+" : "") + points(entry.availableDelta),
    time: date(row.createdAt),
  };
}
