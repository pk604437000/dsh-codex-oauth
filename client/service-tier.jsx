import React from "react";

const h = React.createElement;
export function ServiceTierControl({ value = "default", disabled = false, writable = false, onChange }) {
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
    h("label", { style: { display: "flex", alignItems: "center", gap: 12 } },
      h("span", null, "Service tier"),
      h("select", { "aria-label": "Service tier", value, disabled: disabled || !writable,
        onChange: (event) => onChange(event.target.value) },
      h("option", { value: "default" }, "Standard"),
      h("option", { value: "fast" }, "Fast"))),
    h("small", null, "Fast requests use more plan allowance or credits. Reasoning effort is unchanged."),
    h("small", null, "Requested service tier only; availability depends on your account and model."),
    !writable ? h("small", null, "Persistent settings are unavailable; edit the profile configuration.") : null);
}
