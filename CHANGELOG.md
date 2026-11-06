# Changelog

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
