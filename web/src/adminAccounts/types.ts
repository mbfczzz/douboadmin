import { date } from "../api";

export type AdminAccount = {
  username: string;
  name: string;
  phone?: string;
  userId?: string;
  role: string;
  partnerId?: string;
  partnerName?: string;
  partnerRole?: string;
  disabled?: boolean;
  archived?: boolean;
  lastLoginAt?: string;
};

export const adminRoleLabel: Record<string, string> = {
  super_admin: "超级管理员",
  operator: "平台运营",
  partner: "服务商",
  branch: "分公司",
  s1: "一级服务商",
  s2: "二级服务商",
};

// Never-logged-in accounts carry Go's zero time.
export const lastLogin = (at?: string) =>
  at && !at.startsWith("0001") ? date(at) : "尚未登录";
