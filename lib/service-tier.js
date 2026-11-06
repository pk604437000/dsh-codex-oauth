import { LlmError } from "@deepseek-ai/dsh-llm";

export function validateServiceTier(value) {
  if (value !== "default" && value !== "fast") throw new LlmError("Unsupported service tier; choose default (Standard) or fast", "UNSUPPORTED_OPTION");
  return value;
}

export function validateSessionId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) || value.trim() !== value
    || ["__proto__", "constructor", "prototype"].includes(value)) {
    throw new LlmError("Invalid session ID", "UNSUPPORTED_OPTION");
  }
  return value;
}

/** Profile configuration owns defaults and session overrides, never OAuth state. */
export function createServiceTierControl(ctx, config) {
  let saves = Promise.resolve();
  const editor = () => ctx.get?.("configEditor");
  const writable = () => ctx.fiber?.entry !== undefined && typeof editor()?.edit === "function";
  const field = (key, fallback) => {
    const value = config?.[key];
    const current = typeof value?.get === "function" ? value.get() : value;
    return current === undefined ? fallback : current;
  };
  const sessions = () => {
    const values = field("sessionServiceTiers", {});
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new LlmError("Invalid session service tier dictionary", "UNSUPPORTED_OPTION");
    return values;
  };
  const persist = (change) => {
    const saved = saves.then(async () => {
      if (!writable()) throw new Error("Persistent plugin configuration is unavailable; edit the profile configuration instead");
      await editor().edit(ctx.fiber.entry, change);
    });
    // Failure rejects its caller without poisoning later default/session writes.
    saves = saved.catch(() => {});
    return saved;
  };
  const control = {
    current(sessionId) {
      return sessionId === undefined ? validateServiceTier(field("serviceTier", "default")) : control.session(sessionId).effectiveTier;
    },
    session(sessionId) {
      validateSessionId(sessionId);
      const defaultTier = validateServiceTier(field("serviceTier", "default"));
      const values = sessions();
      const selection = Object.hasOwn(values, sessionId) ? validateServiceTier(values[sessionId]) : "inherit";
      return { sessionId, selection, effectiveTier: selection === "inherit" ? defaultTier : selection, defaultTier };
    },
    writable,
    async save(value) {
      validateServiceTier(value);
      await persist((raw) => ({ ...raw, serviceTier: value }));
      return value;
    },
    async saveSession(sessionId, value) {
      validateSessionId(sessionId);
      if (value !== "inherit") validateServiceTier(value);
      await persist((raw) => {
        const values = { ...raw?.sessionServiceTiers };
        if (value === "inherit") delete values[sessionId];
        else values[sessionId] = value;
        return { ...raw, sessionServiceTiers: values };
      });
      return control.session(sessionId);
    },
  };
  return control;
}
