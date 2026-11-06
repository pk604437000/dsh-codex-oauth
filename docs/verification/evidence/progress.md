# SDD ledger — plan: docs/superpowers/plans/2026-11-06-session-service-tier.md

User approved short design plus detailed plan; inline execution and installation into current web profile. No additional live model probes. Baseline dc37d950c083d864a9ece84c5ea3ab55d042d497: npm test62/62 pass.

Pre-flight: Task1→Task2: control.current(sessionId?)/session(sessionId)/saveSession(sessionId,selection)/writable and validateSessionId; session snapshot uses selection/effectiveTier/defaultTier. Matched.
Pre-flight: Task1/2→Task3: GET/POST session-service-tier with session_id and optional value, snapshot plus writable; actual session scoped slot props + native model directory store. Matched.
Pre-flight: Tasks1–3→Task4: npm test includes new session UI tests; client dependency metadata + prebuilt bundle, version0.3.3-fast.0. Matched.
Ruling: Continue in user's dedicated clone on existing feat/fast-mode rather than add a nested worktree — user explicitly requested this path and approved implementation in the existing fork/branch — main stays protected by branch separation, but there is no second checkout protecting this clone from accidental edits.
Task1 base: dc37d950c083d864a9ece84c5ea3ab55d042d497.

Task1 evidence: scoped tests RED10 failures (wrong global fallback/missing session API) -> GREEN36/36; full npm test green; real Cordis dictionary and real DSH compaction summarizer covered.
Task 1: complete (commits dc37d95..5ab2121, tests: node --test test/service-tier.mjs test/adapter.mjs → ℹ duration_ms 475.25117)

Task2 evidence: new-route RED7 absent-handler failures -> GREEN16/16; cold persistence uses actual snapshot.header.id; invalid input checked before lookup, no Agent resolution; full suite green.
Task 2: complete (commits 5ab2121..60ae4ae, tests: node --test test/web-auth.mjs → ℹ duration_ms 419.449309)

Task3 evidence: compiled bundle + real React DOM RED9 absent-control failures -> GREEN16/16; independent panes, switching with stale reads/saves, persistence reload, inherited-default refresh, read-only/unbound/addressed/non-Codex guards covered; full suite green.
Task 3: complete (commits 60ae4ae..ecafaa3, tests: npm test → ℹ duration_ms 1925.39814)

Task4 candidate: functional Tasks1–3 green, release0.3.3-fast.0 and documentation prepared; full suite green.
Ruling: Run final review inside Task4 after implementation and before deployment, as the approved plan orders — avoid installing before the independent gate — deployment/documentation completion will rely on direct verification rather than another review.
Ruling: Review with the fresh-context subagent tool using its available inherited model — this tool schema has no provider/model selector and a workflow was not requested — there is no independently specified strongest model, but the fresh-context review and full tests remain mandatory.

Final whole-branch review ca5b8b4..d724ba4: 0 Critical, I1 Important, M1 Minor. Parent accepted I1 after reproducing 2/2 RED (old inherited Standard after committed/delayed POST or failed response); dirty invalidation replay + error preservation -> full npm test89/89 GREEN. One fix pass, no re-review.
Minor (deferred): M1 from npm0.3.1 TUI quota sync can show stale Codex quota after provider change until30s; informational only, no tier/request mutation; outside current Web feature.
Ruling: Reviewer Declined-to-judge1–8 each resolved explicitly in docs/verification/2026-11-06-session-service-tier.md — retain no-live-probe, prior provenance and account-state boundaries; executor owns actual deployment checks; preserve approved profile-local/independent-ID/Web/retention scope — no broader audit or non-local deployment guarantee.

Runtime integration I2: genuine browser stacks directoryFor→session slot inject showed undeclared remote.session (helper dependencies isolated); strict directory namespace fixture RED1 -> GREEN full90/90. Consumer scope declares remote + remote.session, matching native model picker.
Ruling: Extend the same parent integration fix pass with this runtime-discovered dependency defect, no extra review loop — actual native integration exposed a seam the plain mock missed — fix is regression-covered and must be rechecked in the browser.
Ruling: Ship0.3.3-fast.1 instead of provisional0.3.3-fast.0 — the latter was already installed while diagnosing I2, so a new package identity prevents stale installation/cache ambiguity — requires one additional local install; no product scope change.
Ruling: Keep user-confirmed push-only feat/fast-mode delivery rather than re-present the finishing menu/creating PR — the approved plan already chooses it — no merge into main or PR is performed.
