// The model a generation runs on, shown as one row; tapping it opens a
// sheet of the models that fit (utils/model-pick.ts builds the list and
// remembers the pick). Emits change {id}.
type ModelItem = { id: string; label: string; iconURL?: string; description?: string };

Component({
  properties: {
    models: { type: Array, value: [] },
    value: { type: String, value: "" },
    title: { type: String, value: "选择模型" },
    disabled: { type: Boolean, value: false },
  },
  data: { open: false, current: null as ModelItem | null },
  observers: {
    "models, value"(models: ModelItem[], value: string) {
      this.setData({ current: models.find((m) => m.id === value) || models[0] || null });
    },
  },
  methods: {
    show() {
      if (!this.data.disabled && this.data.models.length > 1) this.setData({ open: true });
    },
    hide() {
      this.setData({ open: false });
    },
    pick(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string;
      this.setData({ open: false });
      if (id !== this.data.value) this.triggerEvent("change", { id });
    },
  },
});
