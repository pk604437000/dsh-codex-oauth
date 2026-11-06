import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { authPath, privateDirectory, ownerOnly } from "./store.js";
import { callbackListener, validateIdentity } from "./auth.js";
import { fetchJSON, OPENAI_ISSUER } from "./openai-http.js";
import { checkRegistration } from "./companion-usage.js";

// Codex's public PKCE client and OAuth contract, kept independent of SIWC and
// pi-ai. This file is the sole writer/refresh owner of our retained v1 login.
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = `${OPENAI_ISSUER}/oauth/token`;
const TERMINAL_ERRORS = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
export function companionPath(nativeFilename = authPath()) { return join(dirname(nativeFilename), ".openai-codex-auth.json"); }
export function tokenClaims(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); }
  catch { return {}; }
}
export function tokenEmail(token) {
  const claims = tokenClaims(token), value = claims.email ?? claims["https://api.openai.com/profile"]?.email;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}
function accountId(token) {
  const value = tokenClaims(token)["https://api.openai.com/auth"]?.chatgpt_account_id;
  return typeof value === "string" && /^[\x21-\x7e]{1,512}$/.test(value) ? value : undefined;
}
function validateDocument(document) {
  if (document?.version !== 1 || !Number.isSafeInteger(document.generation ?? 0) || (document.generation ?? 0) < 0) throw new Error("Invalid Codex quota auth format");
  const c = document.credential;
  if (c !== undefined && (c?.type !== "oauth" || ["access", "refresh", "accountId"].some((key) => typeof c[key] !== "string" || !c[key]) || !Number.isFinite(c.expires) || c.expires <= 0)) throw new Error("Invalid Codex quota credential");
  return document;
}
export class CompanionCredentialStore {
  #listeners = new Set();
  constructor(filename = companionPath()) { this.filename = filename; }
  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  async readDocument() {
    await privateDirectory(this.filename); await ownerOnly(this.filename);
    try {
      const info = await lstat(this.filename);
      if (!info.isFile() || info.size > 1_048_576) throw new Error("Invalid Codex quota credential file");
      return validateDocument(JSON.parse(await readFile(this.filename, "utf8")));
    } catch (error) { if (error.code === "ENOENT") return { version: 1, generation: 0 }; throw error; }
  }
  async read() {
    const document = await this.readDocument();
    return document.credential ? { ...document.credential, generation: document.generation ?? 0 } : undefined;
  }
  async transaction(callback, signal) {
    await privateDirectory(this.filename);
    return withFileLock(this.filename, async () => {
      signal?.throwIfAborted();
      const document = await this.readDocument(), before = JSON.stringify(document);
      const result = await callback(document);
      validateDocument(document);
      if (before !== JSON.stringify(document)) {
        // Persist a successful rotation even if the caller was cancelled after
        // the token endpoint consumed its old refresh token.
        await writeFileAtomic(this.filename, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 });
        for (const listener of this.#listeners) { try { listener(); } catch {} }
      }
      return structuredClone(result);
    }, { waitMs: 60_000, signal });
  }
  async disconnect() {
    await this.transaction((document) => { delete document.credential; document.generation = (document.generation ?? 0) + 1; });
  }
}
function ensureMatching(credential, expectedEmail) {
  if (!credential || !expectedEmail || tokenEmail(credential.access) !== expectedEmail || accountId(credential.access) !== credential.accountId) {
    throw new Error("Connect Codex quota with the same ChatGPT account and workspace");
  }
}
function fields(tokens, previous, now) {
  if (typeof tokens.access_token !== "string" || !tokens.access_token || typeof tokens.refresh_token !== "string" || !tokens.refresh_token
    || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || (tokens.token_type !== undefined && String(tokens.token_type).toLowerCase() !== "bearer")) throw new Error("Invalid Codex quota token response");
  const id = accountId(tokens.access_token), email = tokenEmail(tokens.access_token);
  if (!id || !email || (previous && (id !== previous.accountId || email !== tokenEmail(previous.access)))) throw new Error("Codex quota refresh changed account identity");
  return { ...previous, type: "oauth", access: tokens.access_token, refresh: tokens.refresh_token, expires: now + tokens.expires_in * 1000, accountId: id, email };
}
export async function getCompanionCredential(store, options = {}) {
  const now = () => options.now?.() ?? Date.now();
  const initial = await store.read(); ensureMatching(initial, options.expectedEmail);
  const needsRefresh = (c) => c.expires <= now() + 60_000 || (options.rejectedAccess !== undefined && c.access === options.rejectedAccess);
  if (!needsRefresh(initial)) return initial;
  let terminal;
  const result = await store.transaction(async (document) => {
    const current = document.credential; ensureMatching(current, options.expectedEmail);
    if (current.accountId !== initial.accountId || (document.generation ?? 0) !== initial.generation) throw new Error("Codex quota login changed during refresh");
    if (!needsRefresh(current)) return { ...current, generation: document.generation ?? 0 };
    try {
      const tokens = await fetchJSON(TOKEN_URL, { method: "POST", signal: options.signal,
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: CODEX_CLIENT_ID, refresh_token: current.refresh }) }, options.fetch);
      // Once rotation succeeded, cancellation must not strand the consumed
      // refresh token. Complete identity validation and persistence under lock.
      if (tokens.id_token && current.subject) await validateIdentity(tokens.id_token, CODEX_CLIENT_ID, { ...options, signal: undefined }, undefined, current.subject);
      document.credential = fields(tokens, current, now());
      return { ...document.credential, generation: document.generation ?? 0 };
    } catch (error) {
      if (!TERMINAL_ERRORS.has(error.providerCode)) throw error;
      delete document.credential; document.generation = (document.generation ?? 0) + 1;
      terminal = new Error("Codex quota login expired. Run dsh-openai-codex quota-login");
    }
  }, options.signal);
  if (terminal) throw terminal;
  return result;
}
export async function companionStatus(store = new CompanionCredentialStore()) {
  const c = await store.read();
  return c ? { authenticated: true, expiresAt: new Date(c.expires), email: tokenEmail(c.access), refreshable: !!c.refresh }
    : { authenticated: false };
}
export async function prepareCompanionLogin(nativeStore, options = {}) {
  const document = await nativeStore.readDocument();
  const account = document?.registrations.find((entry) => entry.clientId === document.activeClientId);
  const expectedEmail = tokenEmail(account?.idToken);
  if (!account?.access || !expectedEmail) throw new Error("Sign in to ChatGPT before connecting quota");
  const assertNativeCurrent = async () => {
    const current = await nativeStore.readDocument();
    if (current?.activeClientId !== document.activeClientId || (current?.generation ?? 0) !== (document.generation ?? 0)
      || !current?.registrations.find((entry) => entry.clientId === document.activeClientId)?.access) throw new Error("The native ChatGPT login changed during quota sign-in");
  };
  return { ...options, expectedEmail, assertNativeCurrent,
    validateRegistration: async (credential, signal) => {
      await assertNativeCurrent();
      await checkRegistration(credential, account.clientId, { fetch: options.fetch, signal });
      await assertNativeCurrent();
    },
  };
}
export async function loginCompanion(store, interaction, options = {}) {
  const signal = AbortSignal.any([...(interaction.signal ? [interaction.signal] : []), AbortSignal.timeout(10 * 60_000)]);
  const initial = await store.readDocument();
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  const listener = await callbackListener(state, CODEX_CLIENT_ID, signal, options.callbackPort ?? 1455, "localhost");
  try {
    const url = new URL(`${OPENAI_ISSUER}/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: CODEX_CLIENT_ID, response_type: "code", redirect_uri: listener.redirectUri,
      scope: "openid profile email offline_access", state, nonce, code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      id_token_add_organizations: "true", codex_cli_simplified_flow: "true", originator: "dsh-codex-oauth",
    }).toString();
    if (!interaction.notify) throw new Error("Codex quota login requires an authorization-URL handler");
    interaction.notify({ type: "auth_url", url: url.href });
    const { code } = await listener.callback;
    const authOptions = { ...options, signal };
    const tokens = await fetchJSON(TOKEN_URL, { method: "POST", signal,
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: CODEX_CLIENT_ID, code, code_verifier: verifier, redirect_uri: listener.redirectUri }) }, options.fetch);
    const identity = await validateIdentity(tokens.id_token, CODEX_CLIENT_ID, authOptions, nonce);
    const credential = fields(tokens, undefined, options.now?.() ?? Date.now());
    ensureMatching(credential, options.expectedEmail);
    if (identity.email?.toLowerCase() !== credential.email) throw new Error("Codex quota ID token did not match its access token");
    await options.validateRegistration?.(credential, signal);
    await store.transaction(async (document) => {
      signal.throwIfAborted(); await options.assertNativeCurrent?.();
      if ((document.generation ?? 0) !== (initial.generation ?? 0)) throw new Error("Codex quota login changed during sign-in");
      document.credential = { ...credential, subject: identity.subject };
      document.generation = (document.generation ?? 0) + 1;
    }, signal);
    return companionStatus(store);
  } finally { listener.close(); }
}
