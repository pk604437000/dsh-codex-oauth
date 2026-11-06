import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { registerWebAuth, AUTH_STATUS_PATH, AUTH_LOGIN_PATH, AUTH_LOGOUT_PATH, AUTH_ACCOUNT_PATH, AUTH_MODELS_PATH } from "../lib/web-auth.js";
import { CodexCredentialStore, OPENAI_CODEX_PROVIDER } from "../lib/store.js";
import { createServiceTierControl } from "../lib/service-tier.js";
const AUTH_SERVICE_TIER_PATH = "/plugins/dsh-codex-oauth/auth/service-tier";
const SESSION_SERVICE_TIER_PATH = "/plugins/dsh-codex-oauth/auth/session-service-tier";

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsh-web-auth-"));
  const handlers = new Map();
  let cleanup;
  const ctx = {
    get(name) { return options.services?.[name]; },
    inject(_deps, callback) { callback({ webServer: { register(route) { handlers.set(route.path, route.handler); return () => handlers.delete(route.path); } } }); },
    effect(fn) { cleanup = fn(); },
  };
  const store = new CodexCredentialStore(join(root, "auth.json"));
  registerWebAuth(ctx, store, { ...options, auth: { callbackPort: 0, fetch() { throw new Error("Cancellation must not contact OpenAI"); }, ...options.auth } });
  t.after(async () => { await cleanup(); await rm(root, { recursive: true, force: true }); });
  async function call(path, overrides = {}) {
    const request = { method: path === AUTH_STATUS_PATH ? "GET" : "POST", url: path, socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }, ...overrides };
    let result;
    await handlers.get(path)(request, { writeHead(status, headers) { result = { status, headers }; }, end(body) { result.body = body; result.value = JSON.parse(body); } });
    return result;
  }
  const session = (id, value) => call(SESSION_SERVICE_TIER_PATH, {
    method: value === undefined ? "GET" : "POST",
    url: `${SESSION_SERVICE_TIER_PATH}?session_id=${encodeURIComponent(id)}${value === undefined ? "" : `&value=${encodeURIComponent(value)}`}`,
  });
  return { store, call, session };
}

function tierFixture(fail = false) {
  let raw = { serviceTier: "default" }, writes = 0;
  const entry = {};
  const ctx = { fiber: { entry }, get: () => ({ async edit(target, change) {
    assert.equal(target, entry); writes++;
    if (fail) throw new Error("disk full access_token=private-access");
    raw = change(raw);
  } }) };
  const config = { serviceTier: { get: () => raw.serviceTier }, sessionServiceTiers: { get: () => raw.sessionServiceTiers ?? {} } };
  return { control: createServiceTierControl(ctx, config), reconstruct: () => createServiceTierControl(ctx, config), writes: () => writes };
}

test("Web service tier persists and appears in status without changing authentication", async (t) => {
  const tier = tierFixture();
  const f = await fixture(t, { serviceTier: tier.control });
  const before = await f.call(AUTH_STATUS_PATH);
  assert.equal(before.value.serviceTier, "default");
  assert.equal(before.value.serviceTierWritable, true);
  const saved = await f.call(AUTH_SERVICE_TIER_PATH, { url: `${AUTH_SERVICE_TIER_PATH}?value=fast` });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.value, { serviceTier: "fast" });
  assert.equal(saved.headers["cache-control"], "no-store");
  assert.equal(tier.reconstruct().current(), "fast");
  const status = await f.call(AUTH_STATUS_PATH);
  assert.equal(status.value.serviceTier, "fast");
  assert.equal(status.value.authenticated, false);
});

test("Web service tier rejects foreign requests before touching configuration", async (t) => {
  const tier = tierFixture(), f = await fixture(t, { serviceTier: tier.control });
  const url = `${AUTH_SERVICE_TIER_PATH}?value=fast`;
  for (const [overrides, status] of [
    [{ method: "GET" }, 405],
    [{ socket: { remoteAddress: "192.0.2.1" } }, 403],
    [{ headers: { host: "attacker.example", origin: "http://attacker.example" } }, 403],
    [{ headers: { host: "127.0.0.1:3080", origin: "https://attacker.example" } }, 403],
    [{ headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080", "sec-fetch-site": "cross-site" } }, 403],
  ]) assert.equal((await f.call(AUTH_SERVICE_TIER_PATH, { url, ...overrides })).status, status);
  assert.equal(tier.writes(), 0);
  assert.equal(tier.control.current(), "default");
});

test("Web service tier rejects missing duplicated and invalid query values", async (t) => {
  const tier = tierFixture(), f = await fixture(t, { serviceTier: tier.control });
  for (const suffix of ["", "?value=", "?value=priority", "?value=ultrafast", "?value=FAST", "?value=fast&value=default", "?value=fast&value=fast"]) {
    assert.equal((await f.call(AUTH_SERVICE_TIER_PATH, { url: `${AUTH_SERVICE_TIER_PATH}${suffix}` })).status, 400);
  }
  assert.equal(tier.writes(), 0);
});

test("Web service tier reports unwritable profiles without pretending to save", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call(AUTH_SERVICE_TIER_PATH, { url: `${AUTH_SERVICE_TIER_PATH}?value=fast` })).status, 503);
  const status = await f.call(AUTH_STATUS_PATH);
  assert.equal(status.value.serviceTier, "default");
  assert.equal(status.value.serviceTierWritable, false);
});

test("Web service tier write failure preserves Standard and redacts sensitive error values", async (t) => {
  const tier = tierFixture(true), f = await fixture(t, { serviceTier: tier.control });
  const result = await f.call(AUTH_SERVICE_TIER_PATH, { url: `${AUTH_SERVICE_TIER_PATH}?value=fast` });
  assert.equal(result.status, 500);
  assert.match(result.value.error, /disk full/);
  assert.equal(result.body.includes("private-access"), false);
  assert.equal((await f.call(AUTH_STATUS_PATH)).value.serviceTier, "default");
});

function sessionServices() {
  const live = new Map(["session-A", "session-B"].map((id) => [id, { id }]));
  const cold = new Set(["cold-session"]);
  const reads = [];
  return {
    live, cold, reads,
    services: {
      sessions: { get(id) { reads.push(["live", id]); return live.get(id); } },
      sessionPersistence: { async stat(id) { reads.push(["stat", id]); return cold.has(id) ? { header: { id, version: 4, cwd: "/fixture", createdAt: "2026-11-06T00:00:00.000Z" }, revision: "test-revision" } : undefined; } },
      sessionController: { resolveAgent() { throw new Error("Tier settings must not activate an Agent"); } },
    },
  };
}

test("session tier routes persist independent choices without changing the default or credentials", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  assert.deepEqual((await f.session("session-A")).value, { sessionId: "session-A", selection: "inherit", effectiveTier: "default", defaultTier: "default", writable: true });
  assert.equal((await f.session("session-A", "fast")).status, 200);
  assert.equal((await f.session("session-B", "default")).status, 200);
  assert.equal((await f.session("session-A")).value.effectiveTier, "fast");
  assert.equal((await f.session("session-B")).value.effectiveTier, "default");
  assert.equal(tier.reconstruct().current("session-A"), "fast");
  assert.equal(tier.control.current(), "default");
  assert.equal(await f.store.readDocument(), undefined);
});

test("session inherit deletes its override and follows later defaults while another session remains pinned", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  await f.session("session-A", "default"); await f.session("session-B", "fast");
  await tier.control.save("fast");
  assert.equal((await f.session("session-A")).value.effectiveTier, "default");
  const inherited = await f.session("session-A", "inherit");
  assert.deepEqual(inherited.value, { sessionId: "session-A", selection: "inherit", effectiveTier: "fast", defaultTier: "fast", writable: true });
  await tier.control.save("default");
  assert.equal((await f.session("session-A")).value.effectiveTier, "default");
  assert.equal((await f.session("session-B")).value.effectiveTier, "fast");
});

test("cold session headers validate without loading agents and unload does not remove saved choices", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  assert.equal((await f.session("cold-session", "fast")).status, 200);
  assert.equal((await f.session("cold-session")).value.selection, "fast");
  await f.session("session-A", "fast");
  sessions.live.delete("session-A"); sessions.cold.add("session-A");
  assert.equal((await f.session("session-A")).value.selection, "fast");
  assert(sessions.reads.some(([kind, id]) => kind === "stat" && id === "cold-session"));
});

test("session tier rejects duplicate malformed identifiers and choices before any write or session lookup", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  for (const suffix of [
    "", "?session_id=", "?session_id=session-A&session_id=session-B", "?session_id=../escape&value=fast",
    "?session_id=session%2FA&value=fast", "?session_id=session-A%0A&value=fast", "?session_id=constructor&value=fast",
    "?session_id=session-A", "?session_id=session-A&value=", "?session_id=session-A&value=priority",
    "?session_id=session-A&value=fast&value=default", "?session_id=session-A&value=fast&value=fast",
  ]) assert.equal((await f.call(SESSION_SERVICE_TIER_PATH, { url: SESSION_SERVICE_TIER_PATH + suffix })).status, 400);
  assert.equal(tier.writes(), 0); assert.equal(sessions.reads.length, 0);
});

test("session tier denies foreign origins and methods before looking up a session", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  const url = SESSION_SERVICE_TIER_PATH + "?session_id=session-A&value=fast";
  for (const [overrides, status] of [
    [{ method: "PUT" }, 405], [{ method: "DELETE" }, 405],
    [{ socket: { remoteAddress: "192.0.2.1" } }, 403],
    [{ headers: { host: "foreign.example", origin: "http://foreign.example" } }, 403],
    [{ headers: { host: "127.0.0.1:3080", origin: "http://foreign.example" } }, 403],
    [{ headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" } }, 403],
  ]) assert.equal((await f.call(SESSION_SERVICE_TIER_PATH, { url, ...overrides })).status, status);
  assert.equal(tier.writes(), 0); assert.equal(sessions.reads.length, 0);
});

test("unknown and mismatched sessions are not created and missing capabilities are explicit", async (t) => {
  const tier = tierFixture(), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  assert.equal((await f.session("unknown-session", "fast")).status, 404);
  sessions.services.sessionPersistence.stat = async () => ({ header: { id: "another-session" }, revision: "other" });
  assert.equal((await f.session("cold-session", "fast")).status, 404);
  assert.equal(tier.writes(), 0);
  const absent = await fixture(t, { serviceTier: tier.control });
  assert.equal((await absent.session("session-A")).status, 503);
  const readonly = await fixture(t, { services: sessionServices().services });
  assert.equal((await readonly.session("session-A")).value.writable, false);
  assert.equal((await readonly.session("session-A", "fast")).status, 503);
});

test("session storage failures retain prior choices and conceal underlying sensitive details", async (t) => {
  const tier = tierFixture(true), sessions = sessionServices();
  const f = await fixture(t, { serviceTier: tier.control, services: sessions.services });
  const failed = await f.session("session-A", "fast");
  assert.equal(failed.status, 500);
  assert.doesNotMatch(failed.body, /private-access|disk full|access_token/);
  assert.equal((await f.session("session-A")).value.selection, "inherit");
  sessions.services.sessionPersistence.stat = async () => { throw new Error("storage access_token=private-access"); };
  const readFailure = await f.session("cold-session");
  assert.equal(readFailure.status, 500);
  assert.doesNotMatch(readFailure.body, /private-access|access_token/);
});

const credential = (clientId) => ({ clientId, subject: `subject-${clientId}`, issuer: "https://auth.openai.com", access: "private-access", refresh: "private-refresh", idToken: "private-id-token", expires: Date.now() + 3600000, scopes: ["chatgpt.tokens.use.direct"] });

test("Web auth rejects foreign hosts, origins and methods before creating a login", async (t) => {
  const { store, call } = await fixture(t);
  assert.equal((await call(AUTH_LOGIN_PATH, { headers: { host: "attacker.example:3080", origin: "http://attacker.example:3080" } })).status, 403);
  assert.equal((await call(AUTH_LOGIN_PATH, { headers: { host: "127.0.0.1:3080", origin: "https://attacker.example" } })).status, 403);
  assert.equal((await call(AUTH_LOGIN_PATH, { method: "GET" })).status, 405);
  assert.equal(await store.readDocument(), undefined);
});

test("cancelling a new-account login preserves the active account and permits a later login", async (t) => {
  const { store, call } = await fixture(t);
  await store.modify(OPENAI_CODEX_PROVIDER, () => credential("oaiapp_existing"));
  const saved = await store.readDocument();
  const start = await call(AUTH_LOGIN_PATH, { url: `${AUTH_LOGIN_PATH}?new_account=1` });
  assert.equal(start.status, 200);
  assert.equal(start.headers["cache-control"], "no-store");
  assert.equal((await call(AUTH_LOGOUT_PATH)).status, 200);
  assert.deepEqual(await store.readDocument(), saved);
  const reauth = await call(AUTH_LOGIN_PATH);
  assert.equal(reauth.status, 200);
  assert.equal(new URL(reauth.value.url).searchParams.has("id_token_hint"), false);
  await call(AUTH_LOGOUT_PATH);
  const status = await call(AUTH_STATUS_PATH);
  assert.equal(status.value.authenticated, true);
  for (const secret of ["private-access", "private-refresh", "private-id-token"]) assert.equal(status.body.includes(secret), false);
});

test("Web account selection and explicit model refresh update the active choices", async (t) => {
  let refreshed, notified = 0;
  const adapter = { options: { onModelsChanged() { notified++; } }, async listModels(provider, options) { refreshed = { provider, options }; return [{ id: "new-model", name: "New Model" }]; } };
  const { store, call } = await fixture(t, { adapter });
  await store.modify(OPENAI_CODEX_PROVIDER, () => credential("oaiapp_first"));
  await store.modify(OPENAI_CODEX_PROVIDER, () => credential("oaiapp_second"));
  const selected = await call(AUTH_ACCOUNT_PATH, { url: `${AUTH_ACCOUNT_PATH}?client_id=oaiapp_first` });
  assert.equal(selected.value.clientId, "oaiapp_first");
  assert.equal(selected.value.accounts.find((account) => account.active).clientId, "oaiapp_first");
  assert.deepEqual((await call(AUTH_MODELS_PATH)).value.models, [{ id: "new-model", name: "New Model" }]);
  assert.deepEqual(refreshed, { provider: "openai-codex", options: { refresh: true } });
  assert.equal(notified, 1);
});

test("Web status exposes only the active account's quota snapshot through the guarded route", async (t) => {
  const quota = { available: true, buckets: [{ id: "codex", windows: [{ label: "5h", remainingPercent: 75, checkedAt: 1000, stale: false }] }] };
  let reads = 0;
  const { store, call } = await fixture(t, { adapter: { async quotaSnapshot() { reads++; return quota; } } });
  await store.modify(OPENAI_CODEX_PROVIDER, () => credential("oaiapp_first"));
  assert.equal((await call(AUTH_STATUS_PATH, { headers: { host: "attacker.example" } })).status, 403);
  assert.equal(reads, 0);
  const result = await call(AUTH_STATUS_PATH);
  assert.deepEqual(result.value.quota, quota);
  for (const secret of ["private-access", "private-refresh", "private-id-token"]) assert.equal(result.body.includes(secret), false);
  assert.equal(reads, 1);
});
