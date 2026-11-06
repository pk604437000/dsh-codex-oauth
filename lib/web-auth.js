import { accounts, logout, status } from "./auth.js";
import { loginWithQuota } from "./login-flow.js";
import { safeMessage } from "./safe-message.js";
import { companionStatus, loginCompanion, prepareCompanionLogin } from "./companion-auth.js";

export const AUTH_STATUS_PATH = "/plugins/dsh-codex-oauth/auth/status";
export const AUTH_LOGIN_PATH = "/plugins/dsh-codex-oauth/auth/login";
export const AUTH_LOGOUT_PATH = "/plugins/dsh-codex-oauth/auth/logout";
export const AUTH_ACCOUNT_PATH = "/plugins/dsh-codex-oauth/auth/account";
export const AUTH_MODELS_PATH = "/plugins/dsh-codex-oauth/auth/models";
export const AUTH_QUOTA_LOGIN_PATH = "/plugins/dsh-codex-oauth/auth/quota/login";
export const AUTH_QUOTA_LOGOUT_PATH = "/plugins/dsh-codex-oauth/auth/quota/logout";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
function trusted(req) {
  const remote = req.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  if (!req.headers.host) return false;
  try {
    const target = new URL(`http://${req.headers.host}`);
    if (!LOOPBACK_HOSTS.has(target.hostname)) return false;
    if (!req.headers.origin) return true;
    return new URL(req.headers.origin).host === target.host;
  } catch { return false; }
}
function json(res, statusCode, value) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
}

export function registerWebAuth(ctx, store, options = {}) {
  let operation, cancellation, challenge, quotaMessage;
  let state = { status: "signed-out" };
  const snapshot = async () => {
    const value = await status(store);
    const quota = options.adapter?.quotaSnapshot ? await options.adapter.quotaSnapshot() : { available: false, buckets: [] };
    const quotaAuth = options.adapter?.quotaLookup?.store ? await companionStatus(options.adapter.quotaLookup.store).catch(() => ({ authenticated: false })) : { authenticated: false };
    return { ...value, accounts: await accounts(store), quotaAuth, quota, status: value.authenticated ? value.planUsage ? "signed-in" : "plan-disabled" : "signed-out" };
  };
  const update = async () => {
    state = await snapshot();
    if (state.authenticated && quotaMessage) state.message = quotaMessage;
    return state;
  };
  const start = (newAccount, quota = false) => {
    if (operation) return;
    const controller = new AbortController();
    cancellation = controller;
    quotaMessage = undefined;
    state = { ...state, status: quota ? "quota-signing-in" : "signing-in" };
    challenge = undefined;
    operation = (async () => {
      try {
        const interaction = {
          signal: controller.signal,
          notify: (event) => {
            if (event.type === "login_stage") {
              state = { ...state, ...event.status, status: "quota-signing-in" };
              challenge = undefined;
              return;
            }
            if (event.type !== "auth_url") return;
            try {
              const url = new URL(event.url);
              if (url.origin !== "https://auth.openai.com") throw new Error("Unexpected OAuth endpoint");
              // Account selection still works without sending a retained ID token to the UI.
              url.searchParams.delete("id_token_hint");
              challenge = { url: url.href };
            } catch (error) { controller.abort(error); }
          },
        };
        if (quota) {
          if (!options.adapter?.quotaLookup?.store) throw new Error("Quota authentication is unavailable");
          await loginCompanion(options.adapter.quotaLookup.store, interaction, await prepareCompanionLogin(store, options.auth));
          options.adapter.quotaLookup.reset();
        } else {
          const result = await loginWithQuota(store, options.adapter?.quotaLookup?.store, interaction, { ...options.auth, newAccount });
          options.adapter?.quotaLookup?.reset();
          if (result.quotaLogin.message) quotaMessage = `Signed in; quota unavailable: ${result.quotaLogin.message}`;
        }
        await update();
      } catch (error) {
        const current = await snapshot().catch(() => ({ authenticated: false }));
        state = controller.signal.aborted ? current : { ...current, status: "error", message: safeMessage(error) };
      } finally {
        if (cancellation === controller) cancellation = undefined;
        operation = undefined;
        challenge = undefined;
      }
    })();
  };
  ctx.inject(["webServer"], (web) => ctx.effect(() => {
    const guarded = (method, handler) => async (req, res) => {
      if (req.method !== method || !trusted(req)) return json(res, req.method === method ? 403 : 405, { error: "forbidden" });
      try { await handler(req, res); } catch (error) { json(res, 500, { error: safeMessage(error) }); }
    };
    const query = (req) => new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
    const routes = [
      web.webServer.register({ kind: "exact", path: AUTH_QUOTA_LOGIN_PATH, handler: guarded("POST", async (_req, res) => {
        start(false, true);
        for (let i = 0; i < 50 && !challenge && operation; i++) await new Promise((resolve) => setTimeout(resolve, 100));
        if (!challenge) throw new Error("Quota OAuth URL was not created");
        json(res, 200, challenge);
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_QUOTA_LOGOUT_PATH, handler: guarded("POST", async (_req, res) => {
        const signingIn = !!operation;
        cancellation?.abort(new Error("quota sign-in cancelled"));
        await operation?.catch(() => {});
        if (!signingIn) {
          if (!options.adapter?.quotaLookup?.store) throw new Error("Quota authentication is unavailable");
          await options.adapter.quotaLookup.store.disconnect(); options.adapter.quotaLookup.reset();
        }
        await update(); json(res, 200, { ok: true });
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_STATUS_PATH, handler: guarded("GET", async (_req, res) => {
        if (!operation && state.status !== "error") await update();
        json(res, 200, { ...state, ...(operation && challenge ? { challenge } : {}) });
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_LOGIN_PATH, handler: guarded("POST", async (req, res) => {
        start(query(req).get("new_account") === "1");
        for (let i = 0; i < 50 && !challenge && operation; i++) await new Promise((resolve) => setTimeout(resolve, 100));
        if (!challenge) throw new Error("OAuth URL was not created");
        json(res, 200, challenge);
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_LOGOUT_PATH, handler: guarded("POST", async (_req, res) => {
        const signingIn = !!operation;
        cancellation?.abort(new Error("sign-in cancelled"));
        await operation?.catch(() => {});
        // Cancelling a new sign-in must not revoke the previously active account.
        const result = signingIn ? { remoteRevoked: true } : await logout(store, options.auth);
        await update();
        json(res, 200, { ok: true, ...result });
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_ACCOUNT_PATH, handler: guarded("POST", async (req, res) => {
        cancellation?.abort(new Error("account changed"));
        await operation?.catch(() => {});
        await store.select(query(req).get("client_id"));
        json(res, 200, await update());
      }) }),
      web.webServer.register({ kind: "exact", path: AUTH_MODELS_PATH, handler: guarded("POST", async (_req, res) => {
        if (!options.adapter) throw new Error("Model adapter is unavailable");
        const models = await options.adapter.listModels("openai-codex", { refresh: true });
        options.adapter.options.onModelsChanged?.();
        json(res, 200, { models });
      }) }),
    ];
    return async () => {
      cancellation?.abort(new Error("plugin disposed"));
      await operation?.catch(() => {});
      for (const dispose of routes) dispose();
    };
  }, "dsh-codex-oauth: Web OAuth routes"));
}
