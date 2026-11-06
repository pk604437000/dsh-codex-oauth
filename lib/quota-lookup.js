import { createHash } from "node:crypto";
import { readQuotaJSON, checkRegistration } from "./companion-usage.js";
import { QuotaTracker } from "./quota.js";
import { CompanionCredentialStore, companionPath, getCompanionCredential, tokenEmail } from "./companion-auth.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_MS = 60_000;
const FAILURE_BACKOFF_MS = 30_000;
const empty = () => ({ available: false, buckets: [] });
export function quotaUsage(body) {
  const groups = [{ id: "codex", rate_limit: body?.rate_limit },
    ...(Array.isArray(body?.additional_rate_limits) ? body.additional_rate_limits.map((value) => ({
      id: value?.metered_feature ?? value?.limit_name, rate_limit: value?.rate_limit,
    })) : [])];
  return groups.flatMap((group) => {
    if (typeof group.id !== "string" || !group.id || !group.rate_limit) return [];
    const windows = {};
    for (const slot of ["primary", "secondary"]) {
      const value = group.rate_limit[`${slot}_window`];
      if (!value) continue;
      const usedPercent = value.used_percent;
      if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) continue;
      if ((value.remaining_percent !== undefined && (typeof value.remaining_percent !== "number" || !Number.isFinite(value.remaining_percent)
        || value.remaining_percent < 0 || value.remaining_percent > 100 || Math.abs(usedPercent + value.remaining_percent - 100) > 1))
        || !Number.isSafeInteger(value.limit_window_seconds) || value.limit_window_seconds <= 0
        || (value.reset_at !== undefined && (!Number.isSafeInteger(value.reset_at) || value.reset_at <= 0 || value.reset_at > 8_640_000_000_000))) continue;
      windows[slot] = { usedPercent, remainingPercent: 100 - usedPercent,
        ...(Number.isSafeInteger(value.limit_window_seconds) && value.limit_window_seconds > 0 ? { windowMinutes: Math.ceil(value.limit_window_seconds / 60) } : {}),
        ...(Number.isSafeInteger(value.reset_at) && value.reset_at > 0 && value.reset_at <= 8_640_000_000_000 ? { resetsAt: value.reset_at } : {}),
      };
    }
    return Object.keys(windows).length ? [{ id: group.id.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80), windows }] : [];
  });
}

// The managed companion login authorizes backend reads; native SIWC tokens are
// never sent there. Both the registration and current credentials are checked
// at request boundaries. See README for this undocumented source's limitations.
export class CodexQuotaLookup {
  #tracker = new QuotaTracker();
  #key;
  #pending;
  #controller;
  #nextCheck = 0;
  #epoch = 0;
  #disposed = false;
  constructor(filename, options = {}) {
    this.store = options.store ?? new CompanionCredentialStore(companionPath(filename));
    this.readCredential = options.readCredential ?? (() => this.store.read());
    this.resolveCredential = options.resolveCredential ?? ((request) => getCompanionCredential(this.store, { ...options, ...request }));
    this.assertNativeCurrent = options.assertNativeCurrent;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }
  reset() {
    this.#epoch++;
    this.#controller?.abort(); this.#controller = undefined;
    this.#pending = undefined; this.#key = undefined; this.#nextCheck = 0;
    this.#tracker.clear();
  }
  dispose() { this.#disposed = true; this.reset(); }
  async snapshot(account, binding) {
    if (this.#disposed) return empty();
    const epoch = this.#epoch;
    let credential;
    try { credential = await this.readCredential(); } catch { this.reset(); return empty(); }
    if (this.#disposed) return empty();
    const address = tokenEmail(account.idToken);
    if (!credential?.access || !credential.refresh || !address || address !== tokenEmail(credential.access)) {
      this.reset(); return empty();
    }
    const key = createHash("sha256").update(JSON.stringify([binding.clientId, binding.generation, credential.accountId, credential.generation ?? 0, account.idToken])).digest("hex");
    if (epoch !== this.#epoch && key !== this.#key) return empty();
    if (key !== this.#key) { this.reset(); this.#key = key; this.#tracker.activate(binding); }
    if (!this.#pending && this.now() >= this.#nextCheck) {
      const controller = new AbortController();
      this.#controller = controller;
      const requestEpoch = this.#epoch;
      const request = (async () => {
        this.#nextCheck = this.now() + FAILURE_BACKOFF_MS;
        try {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
          await this.assertNativeCurrent?.(binding);
          let fresh = await this.resolveCredential({ expectedEmail: address, signal });
          const assertCurrent = async () => {
            signal.throwIfAborted();
            await this.assertNativeCurrent?.(binding);
            const current = await this.readCredential();
            if (!current || current.access !== fresh.access || current.accountId !== fresh.accountId
              || (current.generation ?? 0) !== (fresh.generation ?? 0)) throw new Error("Codex quota login changed during query");
          };
          let updates;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await assertCurrent();
              await checkRegistration(fresh, binding.clientId, { fetch: this.fetch, signal });
              await assertCurrent();
              const response = await this.fetch(USAGE_URL, {
                redirect: "error", signal,
                headers: { authorization: `Bearer ${fresh.access}`, "chatgpt-account-id": fresh.accountId },
              });
              updates = quotaUsage(await readQuotaJSON(response));
              if (!updates.length) throw new Error("Quota response has no windows");
              await assertCurrent(); break;
            } catch (error) {
              if (error.status !== 401 || attempt) throw error;
              fresh = await this.resolveCredential({ expectedEmail: address, signal, rejectedAccess: fresh.access });
            }
          }
          if (this.#disposed || requestEpoch !== this.#epoch || controller.signal.aborted) return;
          // WHAM is a complete snapshot: null/missing windows must retire old data.
          this.#tracker.clear(); this.#tracker.activate(binding);
          this.#tracker.update(binding, updates, 0, this.now());
          this.#nextCheck = this.now() + REFRESH_MS;
        } catch {
          // A failed registration/auth check cannot reuse a prior plan snapshot.
          if (!this.#disposed && requestEpoch === this.#epoch) { this.#tracker.clear(); this.#tracker.activate(binding); }
        }
      })();
      this.#pending = request;
      void request.finally(() => {
        if (this.#pending === request) { this.#pending = undefined; this.#controller = undefined; }
      });
    }
    await this.#pending;
    return this.#disposed || this.#key !== key ? empty() : this.#tracker.snapshot(this.now());
  }
}
