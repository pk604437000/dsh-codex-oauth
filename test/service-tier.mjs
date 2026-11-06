import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import * as plugin from "../lib/index.js";
import { createServiceTierControl, validateServiceTier } from "../lib/service-tier.js";

async function fixture(t, beforeWrite = async () => {}, initial = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsh-tier-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, "profile.json");
  let raw = { unrelated: { keep: true }, ...initial };
  await writeFile(filename, JSON.stringify(raw));
  const config = {
    serviceTier: { get: () => raw.serviceTier ?? "default" },
    sessionServiceTiers: { get: () => raw.sessionServiceTiers ?? {} },
  };
  const entry = { id: "llm-codex-oauth" };
  const editor = { async edit(target, change) {
    assert.equal(target, entry);
    const next = change(structuredClone(raw));
    await beforeWrite(next);
    await writeFile(filename, JSON.stringify(next));
    raw = next;
  } };
  const ctx = { fiber: { entry }, get: (name) => name === "configEditor" ? editor : undefined };
  const control = createServiceTierControl(ctx, config);
  return { control, ctx, config, filename };
}

test("default tier is Standard even without a profile editor", async () => {
  const control = createServiceTierControl({}, undefined);
  assert.equal(control.current(), "default");
  assert.equal(control.writable(), false);
  await assert.rejects(control.save("fast"), /persist|config|editor/i);
  assert.equal(control.current(), "default");
});

test("invalid tiers fail before writes", async (t) => {
  const f = await fixture(t);
  for (const invalid of [undefined, null, "", "priority", "ultrafast", "FAST", " fast", 1, false, {}, []]) {
    assert.throws(() => validateServiceTier(invalid), /service tier/i);
    await assert.rejects(f.control.save(invalid), /service tier/i);
  }
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true } });
  assert.equal(f.control.current(), "default");
});

test("save preserves unrelated config and survives controller reconstruction", async (t) => {
  const f = await fixture(t);
  assert.equal(f.control.writable(), true);
  assert.equal(await f.control.save("fast"), "fast");
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true }, serviceTier: "fast" });
  assert.equal(createServiceTierControl(f.ctx, f.config).current(), "fast");
  assert.equal(await f.control.save("default"), "default");
  assert.equal(f.control.current(), "default");
});

test("failed save keeps current tier and persisted config", async (t) => {
  const f = await fixture(t, async () => { throw new Error("disk full"); });
  await assert.rejects(f.control.save("fast"), /disk full/);
  assert.equal(f.control.current(), "default");
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true } });
});

test("concurrent saves serialize and recover after rejection", async (t) => {
  let began, release, writes = 0;
  const started = new Promise((resolve) => { began = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  const f = await fixture(t, async () => { if (++writes === 1) { began(); await gate; throw new Error("first write failed"); } });
  const first = assert.rejects(f.control.save("fast"), /first write failed/);
  await started;
  const second = f.control.save("fast");
  const third = f.control.save("default");
  assert.equal(writes, 1);
  assert.equal(f.control.current(), "default");
  release();
  await first;
  assert.equal(await second, "fast");
  assert.equal(await third, "default");
  assert.equal(writes, 3);
  assert.equal(f.control.current(), "default");
  assert.equal(JSON.parse(await readFile(f.filename, "utf8")).serviceTier, "default");
});

test("real Cordis Config references resolve default and fast", async (t) => {
  for (const [raw, expected] of [[{}, "default"], [{ serviceTier: "fast" }, "fast"]]) {
    const ctx = new Context();
    t.after(() => ctx.fiber.dispose());
    let control;
    await ctx.plugin({ name: "real-tier-config", Config: plugin.Config, apply(child, config) { control = createServiceTierControl(child, config); } }, raw);
    assert.equal(control.current(), expected);
  }
});

const A = "session-A", B = "session-B";

test("session overrides take precedence without changing other sessions or the fallback", async (t) => {
  const f = await fixture(t, undefined, { sessionServiceTiers: { [A]: "fast", [B]: "default" } });
  assert.equal(f.control.current(A), "fast");
  assert.equal(f.control.current(B), "default");
  assert.equal(f.control.current("session-C"), "default");
  assert.equal(f.control.current(), "default");
  assert.deepEqual(f.control.session(A), { sessionId: A, selection: "fast", effectiveTier: "fast", defaultTier: "default" });
});

test("session saves preserve other keys and survive reconstruction", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.control.saveSession(A, "fast"), { sessionId: A, selection: "fast", effectiveTier: "fast", defaultTier: "default" });
  await f.control.saveSession(B, "default");
  const rebuilt = createServiceTierControl(f.ctx, f.config);
  assert.equal(rebuilt.current(A), "fast");
  assert.equal(rebuilt.current(B), "default");
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true }, sessionServiceTiers: { [A]: "fast", [B]: "default" } });
});

test("explicit Standard resists a Fast default and inherit removes only that session override", async (t) => {
  const f = await fixture(t, undefined, { sessionServiceTiers: { [A]: "default", [B]: "fast" } });
  await f.control.save("fast");
  assert.equal(f.control.current(A), "default");
  assert.equal(f.control.current("session-C"), "fast");
  assert.deepEqual(await f.control.saveSession(A, "inherit"), { sessionId: A, selection: "inherit", effectiveTier: "fast", defaultTier: "fast" });
  await f.control.save("default");
  assert.equal(f.control.current(A), "default");
  assert.equal(f.control.current(B), "fast");
  const persisted = JSON.parse(await readFile(f.filename, "utf8"));
  assert.deepEqual(persisted.sessionServiceTiers, { [B]: "fast" });
  assert.equal(persisted.serviceTier, "default");
});

test("queued default and two session writes merge the latest configuration", async (t) => {
  let began, release, writes = 0;
  const started = new Promise((resolve) => { began = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  const f = await fixture(t, async () => { if (++writes === 1) { began(); await gate; } });
  const first = f.control.saveSession(A, "fast");
  await started;
  const second = f.control.save("fast");
  const third = f.control.saveSession(B, "default");
  assert.equal(writes, 1);
  assert.equal(f.control.current(A), "default");
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true }, serviceTier: "fast", sessionServiceTiers: { [A]: "fast", [B]: "default" } });
});

test("failed session persistence retains the confirmed value and the queue can recover", async (t) => {
  let writes = 0;
  const f = await fixture(t, async () => { if (++writes === 1) throw new Error("disk full"); });
  await assert.rejects(f.control.saveSession(A, "fast"), /disk full/);
  assert.deepEqual(f.control.session(A), { sessionId: A, selection: "inherit", effectiveTier: "default", defaultTier: "default" });
  await f.control.saveSession(B, "fast");
  assert.equal(f.control.current(A), "default");
  assert.equal(f.control.current(B), "fast");
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true }, sessionServiceTiers: { [B]: "fast" } });
  await assert.rejects(createServiceTierControl({}, {}).saveSession(A, "fast"), /persist|config|editor/i);
});

test("session identifiers and choices fail before persistence and inherited object keys are ignored", async (t) => {
  const f = await fixture(t);
  for (const id of [undefined, null, "", "../escape", "a/b", "a\\b", "a\nb", "a b", "__proto__", "constructor", "prototype", "x".repeat(129), 12]) {
    assert.throws(() => f.control.session(id), /session/i);
    await assert.rejects(f.control.saveSession(id, "fast"), /session/i);
  }
  for (const value of [undefined, null, "", "priority", "ultrafast", "FAST", {}, []]) await assert.rejects(f.control.saveSession(A, value), /service tier/i);
  assert.deepEqual(JSON.parse(await readFile(f.filename, "utf8")), { unrelated: { keep: true } });
  const inherited = createServiceTierControl({}, { serviceTier: "default", sessionServiceTiers: Object.create({ [A]: "fast" }) });
  assert.equal(inherited.current(A), "default");
  assert.throws(() => createServiceTierControl({}, { sessionServiceTiers: { [A]: "priority" } }).current(A), /service tier/i);
});

test("real Cordis volatile session dictionary retains independent values", async (t) => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  let control;
  await ctx.plugin({ name: "real-session-tier-config", Config: plugin.Config, apply(child, config) { control = createServiceTierControl(child, config); } }, { serviceTier: "fast", sessionServiceTiers: { [A]: "default", [B]: "fast" } });
  assert.equal(control.current(A), "default");
  assert.equal(control.current(B), "fast");
  assert.equal(control.current("session-C"), "fast");
});
