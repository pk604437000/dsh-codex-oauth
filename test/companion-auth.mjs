import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { CompanionCredentialStore, getCompanionCredential, companionStatus } from "../lib/companion-auth.js";
import { CodexCredentialStore, OPENAI_CODEX_PROVIDER } from "../lib/store.js";

const now = 1_000_000;
const token = (email = "person@example.test", accountId = "account-test", suffix = "old") => `header.${Buffer.from(JSON.stringify({ email, "https://api.openai.com/auth": { chatgpt_account_id: accountId } })).toString("base64url")}.${suffix}`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dsh-companion-regression-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const native = new CodexCredentialStore(join(root, "native.json"));
  await native.modify(OPENAI_CODEX_PROVIDER, () => ({ clientId: "oaiapp_test", subject: "subject-test", issuer: "https://auth.openai.com", access: "native-only", idToken: token(), expires: now + 3_600_000, scopes: ["chatgpt.tokens.use.direct"] }));
  const nativeBefore = await readFile(native.filename, "utf8");
  const store = new CompanionCredentialStore(join(root, ".openai-codex-auth.json"));
  await store.transaction((document) => { document.credential = { type: "oauth", access: token(), refresh: "refresh-old", accountId: "account-test", expires: now - 1 }; });
  return { store, native, nativeBefore };
}

test("companion refresh rotates once across independent stores and preserves native credentials", async (t) => {
  const { store, native, nativeBefore } = await fixture(t);
  let calls = 0, started, release;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  const options = { expectedEmail: "person@example.test", now: () => now, async fetch(url, options) {
    calls++;
    assert.equal(url, "https://auth.openai.com/oauth/token");
    assert.equal(new URLSearchParams(options.body).get("refresh_token"), "refresh-old");
    started(); await gate;
    return json({ access_token: token(undefined, undefined, "new"), refresh_token: "refresh-new", expires_in: 3600, token_type: "Bearer" });
  } };
  const first = getCompanionCredential(store, options);
  await ready;
  const second = getCompanionCredential(new CompanionCredentialStore(store.filename), options);
  release();
  const credentials = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(credentials[0].refresh, "refresh-new");
  assert.deepEqual(credentials[0], credentials[1]);
  assert.equal((await store.read()).refresh, "refresh-new");
  assert.equal(await readFile(native.filename, "utf8"), nativeBefore);
  assert.equal((await stat(store.filename)).mode & 0o777, 0o600);
});

test("temporary companion refresh failure preserves credentials", async (t) => {
  const { store } = await fixture(t);
  const saved = await store.read();
  await assert.rejects(getCompanionCredential(store, { expectedEmail: "person@example.test", now: () => now, fetch: async () => json({ error: "temporarily_unavailable" }, 503) }));
  assert.deepEqual(await store.read(), saved);
});

test("terminal companion refresh failure disconnects only quota login", async (t) => {
  const { store, native, nativeBefore } = await fixture(t);
  await assert.rejects(getCompanionCredential(store, { expectedEmail: "person@example.test", now: () => now, fetch: async () => json({ error: "invalid_grant" }, 400) }), /expired/);
  assert.equal((await companionStatus(store)).authenticated, false);
  assert.equal(await readFile(native.filename, "utf8"), nativeBefore);
});

test("wrong companion account fails before contacting token service", async (t) => {
  const { store } = await fixture(t);
  let calls = 0;
  await assert.rejects(getCompanionCredential(store, { expectedEmail: "other@example.test", now: () => now, fetch: async () => { calls++; throw new Error("Unexpected network"); } }), /same ChatGPT account/);
  assert.equal(calls, 0);
});
