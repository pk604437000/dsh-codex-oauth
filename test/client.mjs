import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const built = await build({
  entryPoints: [new URL("../client/service-tier.jsx", import.meta.url).pathname],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "shared-react", setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(require.resolve("react")).href, external: true }));
  } }],
});
const { ServiceTierControl } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const render = (props = {}) => renderToStaticMarkup(React.createElement(ServiceTierControl, { value: "default", writable: true, onChange() {}, ...props }));
const options = (html) => [...html.matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)].map(([, attributes, label]) => ({
  value: /value="([^"]*)"/.exec(attributes)?.[1], label, selected: /\bselected(?:=|\s|$)/.test(attributes),
}));

test("service tier control offers Standard and Fast with the persisted value selected", () => {
  assert.deepEqual(options(render()), [
    { value: "default", label: "Standard", selected: true },
    { value: "fast", label: "Fast", selected: false },
  ]);
  assert.deepEqual(options(render({ value: "fast" })), [
    { value: "default", label: "Standard", selected: false },
    { value: "fast", label: "Fast", selected: true },
  ]);
});

test("service tier control disables changes during writes or without profile persistence", () => {
  assert.doesNotMatch(render(), /<select\b[^>]*\bdisabled/);
  assert.match(render({ disabled: true }), /<select\b[^>]*\bdisabled/);
  const unavailable = render({ writable: false });
  assert.match(unavailable, /<select\b[^>]*\bdisabled/);
  assert.match(unavailable, /profile configuration/i);
});

test("service tier control explains higher usage without claiming actual Fast eligibility", () => {
  const html = render({ value: "fast" });
  assert.match(html, /more (?:plan )?(?:allowance|usage|credits)/i);
  assert.match(html, /requested service tier/i);
  assert.match(html, /account and model/i);
  assert.match(html, /reasoning effort/i);
  assert.doesNotMatch(html, /ultrafast/i);
});
