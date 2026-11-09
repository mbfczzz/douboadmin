import { date } from "../api";

export type AdminAccount = {
  username: string;
  name: string;
  phone?: string;
  role: string;
  disabled?: boolean;
  archived?: boolean;
  lastLoginAt?: string;
};

export const adminRoleLabel: Record<string, string> = {
  super_admin: "超级管理员",
  operator: "平台运营",
};

// Never-logged-in accounts carry Go's zero time.
export const lastLogin = (at?: string) =>
  at && !at.startsWith("0001") ? date(at) : "尚未登录";
