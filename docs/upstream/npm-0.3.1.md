# npm 0.3.1 baseline provenance

- Upstream Git base: `ca5b8b42d8148786bfc881cdca61db69460ac1fe` (package version 0.3.0).
- Registry metadata: https://registry.npmjs.org/dsh-codex-oauth/0.3.1
- Package archive: https://registry.npmjs.org/dsh-codex-oauth/-/dsh-codex-oauth-0.3.1.tgz
- Verified SRI: `sha512-yKrbR1cdFiXKDAcWUnWV96woiXWjq6PnmDZYff3bxq4aYTXkjGcqPDSm99452+OJxaopBxfhhwHfMdCzo44xSA==`

Only allowlisted published source, documentation and metadata were imported. Repository tests, build tooling, ignore rules, Git history and plan documents were preserved. No production profile, credentials or machine state were copied. The local unsupported-ultra filter is intentionally applied in a separate commit, not represented as pristine upstream source.

The npm package omits tests/build scripts despite referring to companion-auth tests; this fork restores regression coverage and updates old quota expectations.

## Imported file allowlist

- `CHANGELOG.md`
- `README.md`
- `README.zh.md`
- `SPEC.md`
- `bin/dsh-openai-codex.js`
- `client/index.jsx`
- `lib/adapter.js`
- `lib/auth.js`
- `lib/client.js`
- `lib/companion-auth.js`
- `lib/companion-usage.js`
- `lib/login-flow.js`
- `lib/models.js`
- `lib/quota-lookup.js`
- `lib/quota-ui.js`
- `lib/quota.js`
- `lib/store.js`
- `lib/tui-model-route.js`
- `lib/web-auth.js`
- `package.json`
