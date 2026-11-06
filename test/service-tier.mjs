import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import * as plugin from "../lib/index.js";
import { createServiceTierControl, validateServiceTier } from "../lib/service-tier.js";

async function fixture(t, beforeWrite = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "dsh-tier-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = join(root, "profile.json");
  let raw = { unrelated: { keep: true } };
  await writeFile(filename, JSON.stringify(raw));
  const config = { serviceTier: { get: () => raw.serviceTier ?? "default" } };
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
