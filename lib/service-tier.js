import { LlmError } from "@deepseek-ai/dsh-llm";

export function validateServiceTier(value) {
  if (value !== "default" && value !== "fast") throw new LlmError("Unsupported service tier; choose default (Standard) or fast", "UNSUPPORTED_OPTION");
  return value;
}

/** Profile configuration owns this setting; it never belongs in OAuth state. */
export function createServiceTierControl(ctx, config) {
  let saves = Promise.resolve();
  const editor = () => ctx.get?.("configEditor");
  const writable = () => ctx.fiber?.entry !== undefined && typeof editor()?.edit === "function";
  return {
    current() {
      const field = config?.serviceTier;
      const value = typeof field?.get === "function" ? field.get() : field;
      return validateServiceTier(value === undefined ? "default" : value);
    },
    writable,
    async save(value) {
      validateServiceTier(value);
      const saved = saves.then(async () => {
        if (!writable()) throw new Error("Persistent plugin configuration is unavailable; edit the profile configuration instead");
        await editor().edit(ctx.fiber.entry, (raw) => ({ ...raw, serviceTier: value }));
        return value;
      });
      // A failed write must reject its caller, without poisoning later writes.
      saves = saved.catch(() => {});
      return saved;
    },
  };
}
