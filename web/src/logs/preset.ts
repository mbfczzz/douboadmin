// Hand-off for "我的操作日志": the account menu names the operator, the logs
// page opens filtered to them once.
const key = "logs.actor";
export const presetActor = (actor: string) =>
  sessionStorage.setItem(key, actor);
export const readPreset = () => sessionStorage.getItem(key) || "";
export const clearPreset = () => sessionStorage.removeItem(key);
