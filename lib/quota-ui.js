import { watch } from "node:fs";
import { quotaSummary, quotaDetails } from "./quota.js";
import { shouldShowCodexQuota, tuiDataDir } from "./tui-model-route.js";

function clearQuotaStatus(clearRef) {
  clearRef.current?.();
  clearRef.current = undefined;
}

export function registerQuotaUi(ctx, adapter, options = {}) {
  const readTuiRoute = options.readTuiRoute;
  ctx.inject(["commands"], (commands) => commands.effect(() => commands.commands.register({
    name: "codex-usage", description: "Show Codex quota windows and reset times (no model request)",
    handler: async ({ rawInput }) => rawInput.trim() ? { kind: "error", text: "Usage: /codex-usage" }
      : { kind: "success", text: quotaDetails(await adapter.quotaSnapshot()) },
  })));
  ctx.inject(["tuiStatus"], (ui) => ui.effect(() => {
    const clearRef = { current: undefined };
    let disposed = false, refreshing = false;
    const refresh = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        if (!shouldShowCodexQuota(adapter, readTuiRoute)) {
          if (!disposed) clearQuotaStatus(clearRef);
          return;
        }
        const snapshot = await adapter.quotaSnapshot();
        if (!disposed) {
          clearRef.current?.();
          clearRef.current = ui.tuiStatus.set("dsh-codex-oauth:quota", quotaSummary(snapshot), ui);
        }
      } catch { /* Status display must not prevent the TUI from starting. */ }
      finally { refreshing = false; }
    };
    const unsubscribe = adapter.quotas.subscribe(refresh);
    const timer = setInterval(refresh, 30_000); timer.unref?.();
    let routeWatcher;
    try {
      routeWatcher = watch(tuiDataDir(), (event, name) => {
        if (name === "model.json" || event === "rename") void refresh();
      });
      routeWatcher.unref?.();
    } catch { /* Missing ~/.dsh-tui is fine; the interval still picks up route changes. */ }
    void refresh();
    return () => {
      disposed = true;
      clearInterval(timer);
      routeWatcher?.close();
      unsubscribe();
      clearQuotaStatus(clearRef);
    };
  }));
}
