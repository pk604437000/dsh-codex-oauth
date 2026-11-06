import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import React, { act } from "react";
import { Window } from "happy-dom";

async function fixture(t, initialTier = "default") {
  const window = new Window({ url: "http://127.0.0.1:3080" });
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  let backend = initialTier, delay, failRead = false, failSave = false, client;
  const timers = new Set();
  const snapshot = () => ({ status: "signed-in", authenticated: true, planUsage: true, accounts: [], quotaAuth: { authenticated: false }, quota: { available: false, buckets: [] }, serviceTier: backend, serviceTierWritable: true });
  const fetch = async (raw, options) => {
    const url = new URL(raw, "http://127.0.0.1:3080");
    if (url.pathname.endsWith("/status")) {
      if (failRead) { failRead = false; throw new Error("status unavailable"); }
      const saved = snapshot(), gate = delay; delay = undefined;
      return { ok: true, async json() { await gate?.promise; return saved; } };
    }
    assert.equal(url.pathname, "/plugins/dsh-codex-oauth/auth/service-tier");
    assert.equal(options.method, "POST");
    if (failSave) return { ok: false, json: async () => ({ error: "disk full" }) };
    backend = url.searchParams.get("value");
    return { ok: true, json: async () => ({ serviceTier: backend }) };
  };
  window.__ModuleLoader__ = { load({ factory }) { client = factory((name) => { assert.equal(name, "react"); return React; }); } };
  const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  runInNewContext(code, { window, fetch, URL,
    setInterval(callback, ms) { const timer = { callback, ms }; timers.add(timer); return timer; },
    clearInterval(timer) { timers.delete(timer); },
  });
  let Component;
  client.apply({ slots: { inject(_name, register) { register(); }, register(_slot, component) { Component = component; return () => {}; } } });
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div"); window.document.body.append(container);
  const root = createRoot(container);
  t.after(async () => {
    try { await act(async () => root.unmount()); await window.happyDOM.abort(); window.close(); }
    finally { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
  });
  await act(async () => root.render(React.createElement(Component)));
  return {
    container, backend: () => backend,
    selected: () => container.querySelector('select[aria-label="Service tier"]')?.value,
    setBackend(value) { backend = value; },
    failNextRead() { failRead = true; }, failSaves() { failSave = true; },
    deferNextStatus() { let release; const promise = new Promise((resolve) => { release = resolve; }); delay = { promise }; return release; },
    async poll() { let pending; await act(async () => { pending = [...timers].find((timer) => timer.ms === 30_000).callback(); await Promise.resolve(); }); return { pending }; },
    async change(value) { await act(async () => { const select = container.querySelector('select[aria-label="Service tier"]'); select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); }); },
  };
}

test("parent settings never replace a successful Fast save with a stale pre-save poll", async (t) => {
  const f = await fixture(t);
  const release = f.deferNextStatus();
  const { pending } = await f.poll();
  await f.change("fast");
  assert.equal(f.backend(), "fast");
  assert.equal(f.selected(), "fast");
  await act(async () => { release(); await pending; });
  assert.equal(f.backend(), "fast");
  assert.equal(f.selected(), "fast");
  await f.change("default");
  assert.equal(f.backend(), "default");
});

test("parent settings discard older out-of-order polls", async (t) => {
  const f = await fixture(t);
  const release = f.deferNextStatus();
  const old = await f.poll();
  f.setBackend("fast");
  const recent = await f.poll(); await recent.pending;
  assert.equal(f.selected(), "fast");
  await act(async () => { release(); await old.pending; });
  assert.equal(f.selected(), "fast");
});

test("parent settings preserve confirmed Fast after a transient status error", async (t) => {
  const f = await fixture(t, "fast");
  f.failNextRead();
  const { pending } = await f.poll(); await pending;
  assert.equal(f.selected(), "fast");
  assert.match(f.container.textContent, /status unavailable/);
});

test("parent settings retain Standard and surface a failed save", async (t) => {
  const f = await fixture(t);
  f.failSaves(); await f.change("fast");
  assert.equal(f.backend(), "default");
  assert.equal(f.selected(), "default");
  assert.match(f.container.textContent, /disk full/);
  assert.equal(f.container.querySelector('select[aria-label="Service tier"]').disabled, false);
});
