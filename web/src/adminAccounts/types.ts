export type AdminAccount = {
  username: string;
  name: string;
  phone?: string;
  role: "super_admin" | "operator";
  disabled?: boolean;
  archived?: boolean;
  lastLoginAt?: string;
};

export const adminRoleLabel = {
  super_admin: "超级管理员",
  operator: "平台运营",
};
