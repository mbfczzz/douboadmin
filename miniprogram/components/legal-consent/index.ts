Component({
  properties: {
    checked: { type: Boolean, value: false },
  },
  methods: {
    // The page owns the state; the box only reports the requested value.
    toggle() {
      this.triggerEvent("change", { checked: !this.data.checked });
    },
  },
});
