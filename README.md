# dsh-codex-oauth — Fast-enabled fork

This is the [pk604437000 fork](https://github.com/pk604437000/dsh-codex-oauth), version **0.3.3-fast.0**, based on the verified npm 0.3.1 release of [eons2long/dsh-codex-oauth](https://github.com/eons2long/dsh-codex-oauth). It adds a persistent Standard / Fast selector and preserves the unsupported-`ultra` compatibility fix. The upstream npm package does not include these Fast controls. [Baseline provenance](docs/upstream/npm-0.3.1.md).

[English](README.md) | [中文](README.zh.md)

Use ChatGPT plan models in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) through [OpenAI's direct OAuth integration](https://developers.openai.com/siwc/token-sharing-open-source). Version 0.3 implements DSH's official `LlmAdapter` directly and has no `pi-ai` or `dsh-llm-pi-ai` dependency.

The plugin handles browser authorization, account selection, rotating token refresh, current account model discovery, and Responses streaming. It translates DSH tools, images and conversation history, and preserves completed encrypted reasoning for subsequent turns. Filesystem access, tool execution, permissions and context compaction remain DSH responsibilities.

## Requirements and installation

Requires Node.js 22 or newer and DSH `0.2.0-rc.2` compatible `dsh-llm` and `dsh-atomic-write` packages. Version 0.3 no longer supports the old DSH 0.1 adapter contract. Automated integration also covers the current DSH `0.2.1-rc.5` host packages; peer ranges explicitly accept that tested prerelease for strict npm consumers.

This Fast prerelease is not published to npm. Build the fork, then install its archive into the profile you actually use. Skip cloning when you already have this checkout:

```bash
git clone --branch feat/fast-mode https://github.com/pk604437000/dsh-codex-oauth.git
cd dsh-codex-oauth
npm ci --ignore-scripts
npm test
npm pack --ignore-scripts
dsh plugin --profile web add -w "file:$PWD/dsh-codex-oauth-0.3.3-fast.0.tgz"
```

After installing, restart your existing DSH Web process and refresh its existing GUI URL. For TUI, replace `--profile web` with `--profile dsh-tui`, then restart that profile. Building/testing this checkout alone does not change a running DSH installation.

Installing the archive also avoids pnpm reusing an older local directory's file list when upgrading an existing source installation.

If the TUI profile also loads its built-in subscription OAuth module, exclude `openai-codex` from `dsh-tui-auth` so this plugin owns that provider. In `$DSH_HOME/profiles/dsh-tui/cordis.patch.yml` (default `~/.dsh/profiles/dsh-tui/cordis.patch.yml`):

```yaml
- id: dsh-tui-auth
  config:
    providers: [anthropic, xai, meta]
```

Preserve any existing `credentialsFile` and `modelOverrides` in that block. Retain only providers supported by your installed TUI. Restart the profile after upgrading the plugin.

## Sign in and choose a model

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex login
dsh plugin --profile dsh-tui exec dsh-openai-codex status
dsh plugin --profile dsh-tui exec dsh-openai-codex models --refresh
```

Authorize the application in the browser and allow ChatGPT plan usage. The local callback binds to `127.0.0.1:1455`, falling back to another loopback port when necessary. This flow requires browser authorization; `--device-code` is unavailable.

In the Web UI, open **Settings → OpenAI Codex**, select **Continue with ChatGPT**, and return after authorization. The section offers account selection, cancellation, sign-out, model refresh and a [manage usage link](https://chatgpt.com/settings/usage). Identity-only authorization is shown separately; sign in again to authorize plan usage.

Choose provider `openai-codex` in DSH's model picker. Models come from the selected account's live catalog, including new releases such as GPT-6.1 Sol when the account has access. The plugin preserves the server's display names and ordering, caches the catalog for five minutes, and supports explicit refresh. It does not maintain a fixed model list.

## Per-session Standard and Fast service tiers

Each editable local Codex conversation has a **Service tier** selector in its input bar beside the model picker: **Inherit default**, **Standard**, or **Fast**. Set A to Fast and B to Standard without changing either one's model/reasoning or the other conversation. Settings persist across refresh/restart and apply to subsequent requests, tool follow-ups and automatic/manual compaction; an in-flight request keeps its captured tier. Non-Codex conversations hide the control, while unbound/addressed read-only scopes cannot modify local profile state.

**Settings → OpenAI Codex → Default service tier** now controls only conversations that inherit, plus ad-hoc calls without a session ID. Existing `serviceTier` configuration remains compatible. A pinned Standard stays Standard even if the default becomes Fast; choosing Inherit default removes that session override. Saving disables the control; failures keep the confirmed selection and show the error. Hosts without a persistent editor disable writes.

For Web or TUI, add this entry to the active profile's `cordis.patch.yml`, preserving other settings:

```yaml
- id: llm-codex-oauth
  config:
    serviceTier: default
    sessionServiceTiers:
      SESSION_ID_A: fast
      SESSION_ID_B: default
```

Replace the example keys with actual session IDs. The Web selector supplies these automatically. Overrides are local to this Host/profile and are not exported with session history. A fork/subagent gets a new identity and inherits the profile default until explicitly set; unloading/archiving does not erase its saved choice.

Only `default` and `fast` are stored configuration values; `inherit` is a session UI/API action that removes the key. `standard`, `priority`, and `ultrafast` are not configuration values. Fast sends `service_tier: "priority"`, matching the ChatGPT-plan catalog's `id: "priority", name: "Fast"`; Standard sends `service_tier: "default"`. At each request the plugin captures **this session's override → profile default → Standard**, including ordinary/tool-follow-up/compaction calls. Other sessions' pinned choices, providers, model IDs, reasoning effort and already-sent requests are unchanged.

Fast consumes more plan allowance or credits; review [current OpenAI rates and eligibility](https://learn.chatgpt.com/docs/agent-configuration/speed). The selector records the **requested** tier, not proof that a model/account supports it or that the server actually used it. A server can reject or downgrade a request. The plugin surfaces errors without silently retrying Standard or switching to API-key billing. Automated tests use mocked providers and do not establish live Fast eligibility; no real model request is part of the normal test command.

**Live verification, 2026-11-06:** after explicit approval, one short request using the catalog's `priority` ID completed successfully but returned `service_tier: "default"`. It does not establish actual Fast processing. The profile was left on Standard after that check; mapping acceptance is not proof of an accelerated tier. See the [live compatibility record](https://github.com/pk604437000/dsh-codex-oauth/blob/feat/fast-mode/docs/verification/2026-11-06-priority-wire-fix.md).

To use Standard in one session, select Standard there. To reset every session, set the profile default to `default` and clear its `sessionServiceTiers` dictionary; changing only the default does not erase pinned Fast choices. To remove this fork entirely, reinstall the previous version with its matching profile backup and restart the profile. OAuth credentials are not converted by tier settings.

## Accounts and credentials

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex login --new-account
dsh plugin --profile dsh-tui exec dsh-openai-codex accounts
dsh plugin --profile dsh-tui exec dsh-openai-codex use <client-id>
dsh plugin --profile dsh-tui exec dsh-openai-codex logout
```

Each account retains its issued application registration. Reauthorization reuses that registration and verifies the same identity. Sign-out attempts remote revocation, clears the selected account's local tokens and keeps the registration for later sign-in. It leaves other accounts intact. Cancelling a pending login preserves the previous account.

Credentials are stored in `$DSH_HOME/.openai-codex-auth.v2.json`, defaulting to `~/.dsh/.openai-codex-auth.v2.json`. The versioned document keeps a stable host identifier, account registrations and the active selection. Writes are atomic; the directory is owner-only and the file is `0600` on POSIX. A cross-process lock serializes token rotation. Temporary refresh failures preserve credentials; terminal refresh failures clear expired authorization.

**Upgrade from 0.2:** sign in again using the new authorization flow. Legacy `.openai-codex-auth.json` credentials cannot authorize this inference route; native login does not overwrite them. The separate managed quota login can renew that file. The plugin never imports or changes `~/.pi/agent/auth.json` or `~/.codex/auth.json`.

## Supported behavior and limits

Requests use `https://api.openai.com/v1/responses` with OAuth, `store: false`, `stream: true` and the required history in `input`. No API key is required. Usage is subject to ChatGPT plan eligibility and application quotas; the plugin never falls back to API key billing.

DSH's session identity supplies stable `session-id` and `x-client-request-id` headers for ordinary and compaction calls. This preserves the gateway's session affinity for prompt-cache reuse; cache hits are still not guaranteed. Calls without a session identity omit these headers.

- DSH function tools run locally, grouped in a Responses namespace. All offered definitions are sent; native Responses `tool_search` is unavailable on this route.
- Text and images use DSH attachments. Files and offloaded images are represented by local handles for DSH tools; this plugin does not upload files to OpenAI's Files API.
- Reasoning effort and context metadata come from the live catalog when advertised. Replay state is reused only for unchanged blocks from the same model and account. Compacted or edited messages use the remaining DSH history.
- `temperature`, `maxTokens` and `stop` fail with `UNSUPPORTED_OPTION` when set, because this ChatGPT plan route does not support them. Leave them unset in your agent configuration.
- DSH history summarization (`purpose: compaction`) accepts the `maxTokens` budget supplied automatically by its compaction backend and omits it from the API request. Automatic and manual DSH compaction can run, but the backend's summary output cap is not enforced by this route. The existing history prefix is preserved before the appended summarization instruction.
- Only a completed response is successful. Usage-limit failures, incomplete responses and interrupted streams have distinct failure semantics. Account quotas stop retries; transient provider failures use DSH's retry policy.
- Hosted Responses image generation, file search, Code Interpreter, computer use, MCP and audio/video are outside this adapter. Local DSH capabilities remain available as function tools.

See OpenAI's [current preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Development

### Quota display

Web settings show English remaining-quota bars and reset timestamps. The TUI status line shows a compact summary; `/codex-usage` expands all available windows and their last-update times. Windows are labeled by the server's duration (300 minutes is 5h, 10,080 minutes is Weekly), not their primary/secondary position.

The compact summary is `codex 81% 4h36m 50% 5d4m`, with shorter windows first. `*` marks stale data; `?` means the reset time is unavailable. For dsh-tui 0.14.0, `node scripts/patch-tui-quota-placement.mjs [path/to/Chat.js]` moves just this contribution into the model/effort footer row below the input box and saves sibling backups of Chat.js and StatusLine.js. The existing field layout truncates narrow rows rather than adding a quota row. This is a local host patch because the public status API only supports placement above the prompt. Reinstalling/upgrading the TUI may remove it; the patch refuses unsupported versions.

For an npm-installed TUI profile, apply the optional patch with:

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/dsh-tui/node_modules/dsh-codex-oauth/scripts/patch-tui-quota-placement.mjs"
```

Restart the TUI afterward. Without this patch the summary uses the standard position above the input box. Installation never applies the patch automatically.

The adapter observes `x-codex-*` response headers and `codex.rate_limits` stream events from normal requests. When these do not provide fresh data, a separate Codex quota login in `.openai-codex-auth.json` queries the ChatGPT backend. This login is independent of native inference and is managed by the plugin, without pi-ai, Pi/Codex app credentials, or model calls. Successful lookups are cached for 60 seconds; failures back off for 30 seconds. Concurrent displays share one request.

Starting with 0.3.1, normal `login` (or **Continue with ChatGPT** in Web settings) also connects quota. It reuses or refreshes matching credentials; otherwise it opens a second authorization after native sign-in. Choose the same account and workspace. Cancelling or failing this second step preserves native sign-in. No separate command is needed for new users. To repair, inspect, or disconnect quota independently:

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-login
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-status
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-logout
```

Choose the same ChatGPT account and workspace as native inference. Existing plugin v1 credentials are reused. Near-expiry tokens refresh automatically under the same cross-process file lock, and the rotated refresh token is persisted atomically. A backend 401 permits one credential refresh and retry. Temporary refresh failures preserve credentials; terminal failures disconnect quota and require quota-login again. Quota logout removes local quota credentials without signing out native inference. Browser login uses the Codex callback on port 1455; close another active login if that port is occupied.

Before reading `https://chatgpt.com/backend-api/wham/usage`, the companion token queries `/backend-api/wham/usage/chatpass/apps`. The complete app list must uniquely match the native client ID; missing/duplicate registrations and unsupported pagination fail closed. Both native and companion identities are checked at request boundaries. Native SIWC tokens are never sent to these endpoints.

This undocumented companion source reports shared plan limits. Registration and email matching do not constitute independent proof of the same user/workspace, and equivalence to all native SIWC application limits remains unconfirmed. These qualifications are documented rather than appended to the UI. Missing, mismatched, revoked, or rejected credentials leave quota unavailable.

Snapshots stay in memory, clear on account changes/sign-out, and become stale after five minutes or a reported reset. Failed companion queries invalidate the previous companion snapshot; passing a reset timestamp never fabricates a fresh 100% allowance. Source formats are parsed independently rather than merging windows from different endpoints.

```bash
npm install
npm test
# Optional: requires a signed-in test account; uses ChatGPT plan allowance.
DSH_HOME=/path/to/test-home npm run test:live -- gpt-6.1-sol
```

`npm test` builds the Web bundle and checks OAuth identity validation, concurrent refresh, account changes, Web route boundaries, streamed errors, tool and reasoning replay, attachments and integration with DSH's official runtime. The live check performs a three-turn tool round trip and verifies history replay.

## License

MIT
