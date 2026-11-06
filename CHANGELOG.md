# Changelog

## 0.3.3-fast.0 — 2026-11-06 (per-session requested tiers)

- Add independent per-session Inherit default / Standard / Fast choices in the conversation input bar beside the model picker, with English/Chinese labels.
- Persist `sessionServiceTiers` in this plugin's volatile profile Config through ConfigEditor; retain `serviceTier` as fallback and preserve unrelated sessions/configuration.
- Resolve each request from its explicit sessionId once; ordinary/tool-follow-up/manual/automatic compaction requests retain the session's tier. No-identity calls use the default, and forks/children start independent.
- Add guarded local GET/POST session tier routes, existing live/cold session validation without Agent activation, and disabled behavior where session persistence is unavailable.
- Isolate UI reads/writes by session identity and generation; preserve confirmed values after failures and prevent stale poll responses from undoing saves. Replay default-change invalidations after pending save responses settle, preserving write errors.
- This is requested-tier selection, not proof of upstream Fast processing. No additional real inference probes were sent for this feature.

## 0.3.2-fast.1 — 2026-11-06 (wire compatibility fix)

- Fix `Unsupported service_tier: fast` on the native ChatGPT-plan route: preserve `serviceTier: fast` in the UI/profile but send the catalog's Fast wire ID `priority`; Standard remains `default`.
- Add a gateway regression reproducing the rejected literal `fast`, plus coverage for priority mapping across turns, compaction and errors without Standard retry or billing-route changes.
- After explicit user approval, one short real request returned HTTP 200/completed with `service_tier: default` despite requesting `priority` (14 input + 5 output tokens). This confirms parameter acceptance, not actual Fast processing or speed. Keep the live profile on Standard; do not claim Fast activation from a successful HTTP response.
- Existing profile-wide scope and requested-tier UI wording are unchanged. No additional live inference was performed beyond that one approved probe.

## 0.3.2-fast.0 — 2026-11-06 (fork prerelease)

- Synchronize checksum-verified npm 0.3.1 source while preserving upstream Git history, build tooling and restored quota-login regression tests.
- Preserve the local compatibility fix that filters unsupported `ultra` reasoning from the live model catalog.
- Add volatile profile configuration `serviceTier: default|fast`, defaulting to Standard. Persist changes with DSH's configuration editor, preserving unrelated settings and serializing writes.
- Send the requested Responses `service_tier` independently of model and reasoning; apply the profile choice to later turns and compaction without rewriting in-flight requests.
- Add a guarded Web service-tier endpoint and a Standard / Fast selector with saving/error states and usage/eligibility explanations.
- Add request, persistence, boundary, React rendering and offline parent-interaction tests; retain the native OAuth and companion quota behavior of 0.3.1.
- Discard stale/out-of-order status polls across service-tier writes and preserve the last confirmed tier on transient read errors, so the UI cannot display Standard while the saved profile remains Fast.
- Explicitly include the tested DSH 0.2.1-rc.5 peer version for strict npm consumers while retaining the original 0.2.0-rc.2 floor; DSH's host-provided prerelease compatibility remains unchanged.
- This fork has not been published to npm. Automated verification uses mocks, not live model calls or an assertion of account Fast eligibility. Building it does not update a running DSH installation.

## 0.3.1 — 2026-10-25

- Show TUI Codex quota only when the active model route is `openai-codex` (`~/.dsh-tui/model.json`, with a fallback after a Codex call). Other providers no longer display Codex usage or run background quota lookups.

- Connect quota through the normal CLI and Web login: reuse or refresh matching credentials, otherwise continue with quota authorization. Cancelling or failing quota authorization preserves completed native sign-in.

- Manage the plugin’s independent Codex quota login with CLI and Web connect/reconnect/disconnect controls. Existing v1 credentials remain usable.
- Refresh near-expiry companion tokens under a cross-process lock and atomically persist rotations. Retry a backend 401 once with refreshed credentials; terminal refresh failure disconnects quota without touching native inference.
- Require a complete, unique native client-ID match in the companion app registration list before reading plan quota. Reject unsupported pagination and changed login state.
- Bound quota response sizes, invalidate companion snapshots on query failure, and preserve native inference and the existing compact UI format.
- Validate with automated OAuth/rotation/query boundary tests and live read-only registration and plan queries.

## 0.3.0 — 2026-10-13

### Upgrade requirements

- Requires Node.js 22+ and the DSH 0.2.0-rc.2 adapter contract.
- Sign in again with the native Sign in with ChatGPT flow. The plugin keeps legacy credentials but cannot use them for native inference.
- Device-code login is no longer supported. Configure supported request options as described in the README.

### Changes

- Implement DSH's official `LlmAdapter` directly, removing the pi-ai dependency. Use native OAuth, the account's live model catalog, and the public Responses API.
- Add account registration, selection, credential renewal and revocation, with verified ID tokens and serialized rotating refreshes.
- Preserve reasoning/tool replay and normalize historical tool call IDs to the API's 64-character limit.
- Supply stable DSH session headers for prompt-cache reuse and allow DSH's automatic compaction budget without sending an unsupported API output cap.
- Add English Web quota bars, compact TUI quota summaries, and `/codex-usage` details. Prefer response quota data; fall back to WHAM with the plugin's retained, unexpired legacy Codex credentials. Quota checks do not call a model.
- Include an optional, manually applied dsh-tui 0.14.0 patch that places quota alongside model and reasoning effort. Narrow terminals truncate fields without an extra quota row.

### Quota limitations

WHAM reports Codex subscription limits; equivalence to native SIWC application limits is unconfirmed. Matching email claims are required but do not prove the same workspace. Legacy credentials are neither imported from Pi/Codex apps nor refreshed by the quota lookup. Missing or expired credentials leave quota unavailable. These source qualifications are documented rather than added to the UI.

### Validation

33 automated behavior tests pass. Native inference, cache affinity, quota lookup, and TUI display were also exercised during local development. The inline layout was checked at normal and 40-column widths.
