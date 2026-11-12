import { createContext, useContext } from "react";

// Signed-in admin identity from /admin/me; menus decide which pages exist.
export interface Me {
  id: string;
  account?: string;
  name?: string;
  role: string;
  roleName?: string;
  canApproveRegistrations?: boolean;
  scope: "platform" | "partner";
  menus: string[];
  partnerId?: string;
  partnerName?: string;
  phone?: string;
  createdAt?: string;
  passwordChangedAt?: string;
  sessionExpires?: string;
}

export const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);
export const isProviderAccount = (me: Me | null) => me?.scope === "partner";
export const canApproveRegistrations = (me: Me | null) =>
  me?.role === "super_admin" && me.canApproveRegistrations !== false;
