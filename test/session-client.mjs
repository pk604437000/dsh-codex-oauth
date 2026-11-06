import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import React, { act } from "react";
import { Window } from "happy-dom";

const SESSION_PATH = "/plugins/dsh-codex-oauth/auth/session-service-tier";
async function fixture(t, options = {}) {
  const window = new Window({ url: "http://127.0.0.1:3080" });
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const choices = new Map(Object.entries(options.choices ?? {})), calls = [], timers = new Set(), readGates = new Map(), saveGates = new Map(), directories = new Map(), dictionaries = new Map();
  const responseGates = new Map();
  let defaultTier = options.defaultTier ?? "default", failSave = false, client, slot, Settings;
  const snapshot = (id) => ({ sessionId: id === options.wrongSession ? "another-session" : id, selection: choices.get(id) ?? "inherit", effectiveTier: choices.get(id) ?? defaultTier, defaultTier, writable: options.writable !== false });
  const fetch = async (raw, request = {}) => {
    const url = new URL(raw, "http://127.0.0.1:3080"), id = url.searchParams.get("session_id");
    const method = request.method ?? "GET";
    calls.push({ path: url.pathname, id, method, value: url.searchParams.get("value") });
    if (url.pathname.endsWith("/status")) return { ok: true, json: async () => ({ status: "signed-out", authenticated: false, planUsage: false, accounts: [], quota: { available: false, buckets: [] }, serviceTier: defaultTier, serviceTierWritable: true }) };
    if (url.pathname.endsWith("/service-tier")) {
      assert.equal(method, "POST"); defaultTier = url.searchParams.get("value");
      return { ok: true, json: async () => ({ serviceTier: defaultTier }) };
    }
    assert.equal(url.pathname, SESSION_PATH);
    assert(id && id !== "undefined", "unbound sessions must not make tier requests");
    if (method === "POST") {
      const response = (saved, ok = true) => {
        const gate = responseGates.get(id); responseGates.delete(id);
        return { ok, async json() { await gate; return saved; } };
      };
      if (failSave) return response({ error: "disk full" }, false);
      const gate = saveGates.get(id); saveGates.delete(id); await gate;
      const value = url.searchParams.get("value");
      if (value === "inherit") choices.delete(id); else choices.set(id, value);
      return response(snapshot(id));
    }
    assert.equal(method, "GET");
    const saved = snapshot(id), gate = readGates.get(id); readGates.delete(id);
    return { ok: true, async json() { await gate; return saved; } };
  };
  const directoryFor = (id) => {
    if (directories.has(id)) return directories.get(id);
    let value = { current: { provider: options.providers?.[id] ?? "openai-codex", model: "gpt-6.1-sol" }, status: "ready", groups: [], failures: [], routable: true, pending: null, error: null };
    const listeners = new Set();
    const directory = { store: { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } }, load: async () => value,
      provider(provider) { value = { ...value, current: { ...value.current, provider } }; for (const listener of listeners) listener(); } };
    directories.set(id, directory); return directory;
  };
  window.__ModuleLoader__ = { load({ factory }) { client = factory((name) => { assert.equal(name, "react"); return React; }); } };
  runInNewContext(await readFile(new URL("../lib/client.js", import.meta.url), "utf8"), {
    window, fetch, URL, AbortController,
    setInterval(callback, ms) { const timer = { callback, ms }; timers.add(timer); return timer; }, clearInterval(timer) { timers.delete(timer); },
  });
  const ctx = {
    slots: { inject(_name, register) { register(); }, register(meta, Component) { if (meta.name === "conversation.input.right") slot = { meta, Component }; if (meta.name === "settings.section") Settings = Component; return () => {}; } },
    locale: { register(name, values) { dictionaries.set(name, values); return () => {}; } },
    effect(fn) { return fn(); },
    sessions: { binding(id) { return id ? { sessionId: id } : undefined; }, subagentAddress(id) { return options.unavailable?.includes(id) ? { mode: "readonly" } : undefined; } },
    remote: { session: {} },
    modelDirectories: { directoryFor },
    inject(deps, callback) {
      const resolve = (name) => name.split(".").reduce((value, key) => value?.[key], ctx);
      if (!deps.every((name) => resolve(name) !== undefined)) return;
      const scope = Object.create(ctx);
      if (options.strictDirectoryNamespace) scope.modelDirectories = { directoryFor(id) {
        // The SDK lazily creates a directory using the consumer's remote.session.
        const granted = new Set([...client.inject, ...deps]);
        if (!granted.has("remote.session")) throw new Error('cannot get property "remote.session" without inject');
        return directoryFor(id);
      } };
      return callback(scope);
    },
  };
  client.apply(ctx);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div"); window.document.body.append(container);
  let root = createRoot(container);
  t.after(async () => {
    try { await act(async () => root.unmount()); await window.happyDOM.abort(); window.close(); }
    finally { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
  });
  assert(slot, "client must register a session-scoped composer tier control");
  const view = async (ids = options.ids ?? ["session-A", "session-B"]) => act(async () => root.render(React.createElement(React.Fragment, null,
    options.withSettings ? React.createElement(Settings, { key: "settings" }) : null,
    ...ids.map((id, index) => {
      const injected = slot.meta.inject(id);
      assert.equal(injected.sessionId, id, "slot must use its actual session identity");
      const t = (key) => dictionaries.get(slot.meta.locale)?.en?.[key] ?? key;
      return React.createElement("section", { key: index, "data-session": String(id) }, React.createElement(slot.Component, { ...injected, t }));
    }))));
  const select = (id) => container.querySelector(`[data-session="${id}"] select`);
  await view();
  return {
    container, calls, select, selected: (id) => select(id)?.value, backend: (id) => choices.get(id), view,
    async change(id, value) { await act(async () => { const field = select(id); assert(field); field.value = value; field.dispatchEvent(new window.Event("change", { bubbles: true })); }); },
    async changeDefault(value) { await act(async () => { const field = container.querySelector('select[aria-label="Service tier"]'); assert(field); field.value = value; field.dispatchEvent(new window.Event("change", { bubbles: true })); }); },
    async provider(id, value) { await act(async () => directoryFor(id).provider(value)); },
    failSaves() { failSave = true; },
    deferRead(id) { let release; readGates.set(id, new Promise((resolve) => { release = resolve; })); return release; },
    deferSave(id) { let release; saveGates.set(id, new Promise((resolve) => { release = resolve; })); return release; },
    deferSaveResponse(id) { let release; responseGates.set(id, new Promise((resolve) => { release = resolve; })); return release; },
    async poll() { const pending = []; await act(async () => { for (const timer of [...timers]) pending.push(timer.callback()); await Promise.resolve(); }); return pending; },
    async settle(release, pending = []) { await act(async () => { release(); await Promise.all(pending); }); },
    async remount(ids) { await act(async () => root.unmount()); root = createRoot(container); await view(ids); },
  };
}

test("session slot supplies the remote namespace required to create a model directory", async (t) => {
  const f = await fixture(t, { strictDirectoryNamespace: true });
  assert.equal(f.selected("session-A"), "inherit");
  await f.change("session-A", "fast");
  assert.equal(f.backend("session-A"), "fast");
});

test("composer controls save two independent sessions and reload their persisted choices", async (t) => {
  const f = await fixture(t);
  assert.equal(f.selected("session-A"), "inherit"); assert.equal(f.selected("session-B"), "inherit");
  await f.change("session-A", "fast"); await f.change("session-B", "default");
  assert.equal(f.backend("session-A"), "fast"); assert.equal(f.backend("session-B"), "default");
  assert.equal(f.selected("session-A"), "fast"); assert.equal(f.selected("session-B"), "default");
  await f.remount(["session-A", "session-B"]);
  assert.equal(f.selected("session-A"), "fast"); assert.equal(f.selected("session-B"), "default");
});

test("changing the profile default refreshes inherited sessions without overriding pinned sessions", async (t) => {
  const f = await fixture(t, { choices: { "session-B": "default" }, withSettings: true });
  assert.match(f.container.textContent, /Default service tier/);
  await f.changeDefault("fast");
  assert.equal(f.selected("session-A"), "inherit"); assert.match(f.select("session-A").selectedOptions[0].textContent, /Fast/);
  assert.equal(f.selected("session-B"), "default");
  await f.change("session-A", "fast"); await f.change("session-A", "inherit");
  assert.equal(f.backend("session-A"), undefined);
});

test("a late session A read cannot replace session B after switching views", async (t) => {
  const f = await fixture(t, { ids: ["session-A"], choices: { "session-A": "fast", "session-B": "default" } });
  const release = f.deferRead("session-A"), pending = await f.poll();
  await f.view(["session-B"]);
  assert.equal(f.selected("session-B"), "default");
  await f.settle(release, pending);
  assert.equal(f.selected("session-B"), "default"); assert.equal(f.backend("session-A"), "fast");
});

test("session polls before and during a write cannot revert a successful save", async (t) => {
  const f = await fixture(t);
  const releaseRead = f.deferRead("session-A"), old = await f.poll();
  const releaseSave = f.deferSave("session-A");
  await f.change("session-A", "fast");
  assert.equal(f.select("session-A").disabled, true);
  const during = await f.poll();
  await f.settle(releaseSave, during);
  assert.equal(f.selected("session-A"), "fast");
  await f.settle(releaseRead, old);
  assert.equal(f.selected("session-A"), "fast"); assert.equal(f.selected("session-B"), "inherit");
});

test("a pending save remains bound to A when the visible component switches to B", async (t) => {
  const f = await fixture(t, { ids: ["session-A"] });
  const release = f.deferSave("session-A"); await f.change("session-A", "fast");
  await f.view(["session-B"]); await f.settle(release);
  assert.equal(f.backend("session-A"), "fast"); assert.equal(f.backend("session-B"), undefined);
  assert.equal(f.selected("session-B"), "inherit");
});

test("default invalidation during a pending session response is replayed after success", async (t) => {
  const f = await fixture(t, { choices: { "session-A": "fast" }, withSettings: true });
  const release = f.deferSaveResponse("session-A");
  await f.change("session-A", "inherit");
  assert.equal(f.backend("session-A"), undefined);
  await f.changeDefault("fast");
  await f.settle(release);
  assert.equal(f.selected("session-A"), "inherit");
  assert.match(f.select("session-A").selectedOptions[0].textContent, /Fast/);
  assert.equal(f.select("session-A").disabled, false);
});

test("failed session response replays a pending default change without hiding the write error", async (t) => {
  const f = await fixture(t, { withSettings: true });
  f.failSaves();
  const release = f.deferSaveResponse("session-A");
  await f.change("session-A", "fast");
  await f.changeDefault("fast");
  await f.settle(release);
  assert.equal(f.selected("session-A"), "inherit");
  assert.match(f.select("session-A").selectedOptions[0].textContent, /Fast/);
  assert.match(f.container.textContent, /disk full/);
  assert.equal(f.select("session-A").disabled, false);
});

test("failed session saves retain the previous selection and restore the control", async (t) => {
  const f = await fixture(t, { choices: { "session-A": "default" } });
  f.failSaves(); await f.change("session-A", "fast");
  assert.equal(f.backend("session-A"), "default"); assert.equal(f.selected("session-A"), "default");
  assert.equal(f.select("session-A").disabled, false); assert.match(f.container.textContent, /disk full/);
});

test("non-Codex and unbound or addressed sessions never write the local profile", async (t) => {
  const f = await fixture(t, { ids: ["session-A", "session-B", undefined], providers: { "session-A": "deepseek" }, unavailable: ["session-B"] });
  assert.equal(f.select("session-A"), null);
  assert(!f.select("session-B") || f.select("session-B").disabled);
  assert.equal(f.select("undefined"), null);
  assert.equal(f.calls.filter((call) => call.path === SESSION_PATH).length, 0);
  await f.provider("session-A", "openai-codex");
  assert.equal(f.selected("session-A"), "inherit");
});

test("read-only profiles disable the session control", async (t) => {
  const f = await fixture(t, { writable: false });
  assert.equal(f.select("session-A").disabled, true);
  assert.equal(f.calls.filter((call) => call.path === SESSION_PATH && call.method === "POST").length, 0);
});

test("mismatched session responses are not adopted as another session's state", async (t) => {
  const f = await fixture(t, { ids: ["session-A"], wrongSession: "session-A" });
  assert.equal(f.select("session-A").disabled, true);
  assert.match(f.container.textContent, /session.*response|response.*session/i);
});
