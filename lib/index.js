import z from "@deepseek-ai/schemastery";
import { createServiceTierControl } from "./service-tier.js";
import { createCodexAdapter } from "./adapter.js";
import { CodexCredentialStore, OPENAI_CODEX_PROVIDER, authPath } from "./store.js";
import { registerWebAuth } from "./web-auth.js";
import { registerQuotaUi } from "./quota-ui.js";
export { login, logout, status } from "./auth.js";

export const name = "llm-codex-oauth";
export const inject = ["llm"];
export const Config = z.object({
  serviceTier: z.union([z.const("default"), z.const("fast")]).default("default").volatile(),
  sessionServiceTiers: z.dict(z.union([z.const("default"), z.const("fast")])).default({}).volatile(),
});

export { OPENAI_CODEX_PROVIDER, CodexCredentialStore, authPath, createCodexAdapter };

export function apply(ctx, config) {
  const credentials = new CodexCredentialStore();
  const serviceTier = createServiceTierControl(ctx, config);
  const adapter = createCodexAdapter(credentials, () => ctx.get?.("attachments"), {
    getServiceTier: (sessionId) => serviceTier.current(sessionId),
    mapHostPath: (path) => ctx.get?.("fs")?.processPathFromHostPath(path),
    onModelsChanged: () => ctx.emit?.("llm/adapters-updated"),
  });
  ctx.llm.registerAdapter(
    [OPENAI_CODEX_PROVIDER],
    adapter,
  );
  ctx.effect?.(() => () => adapter.dispose());
  registerWebAuth(ctx, credentials, { adapter, serviceTier });
  registerQuotaUi(ctx, adapter);
  ctx.inject?.(["settings"], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
}
