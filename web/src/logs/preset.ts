// Hand-off for "我的操作日志": the account menu names the operator (by id, an
// exact key) and the logs page applies it once — on mount, or at once when
// it is already open. Kept in memory: nothing lingers for a later visit.
let pending = "";
const event = "logs-actor";
export function presetActor(actor: string) {
  pending = actor;
  window.dispatchEvent(new Event(event));
}
export function takePreset() {
  const actor = pending;
  pending = "";
  return actor;
}
export function onPreset(apply: () => void) {
  window.addEventListener(event, apply);
  return () => window.removeEventListener(event, apply);
}
