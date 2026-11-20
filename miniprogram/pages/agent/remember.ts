import { sessionUserId } from "../../services/session";

// Which project the Agent tab opens (per account): an id, or "new" for the
// skill picker.
const KEY = "agent-session";
export const remembered = () => (wx.getStorageSync(KEY) as { user?: string; id?: string }) || {};
export const remember = (id: string) => wx.setStorageSync(KEY, { user: sessionUserId(), id });
