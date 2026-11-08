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
