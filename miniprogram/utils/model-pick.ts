// The model a generation runs on when its page offers a choice
// (components/model-picker): the user's last pick for that feature if it
// still fits, else the default (the first that fits). Remembered per feature.
type Pickable = { id: string; name?: string; label?: string; iconURL?: string; description?: string; settings?: { description?: string } };
const KEY = "model-pick:";

export function pickerItems(models: Pickable[]) {
  return models.map((m) => ({ id: m.id, label: m.label || m.name || m.id, iconURL: m.iconURL || "", description: m.description ?? m.settings?.description ?? "" }));
}

export function savedModel<T extends { id: string }>(feature: string, models: T[]): T | undefined {
  const saved = wx.getStorageSync(KEY + feature) as string;
  return models.find((m) => m.id === saved) || models[0];
}

export function saveModel(feature: string, id: string) {
  wx.setStorageSync(KEY + feature, id);
}
